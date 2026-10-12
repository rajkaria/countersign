import { z } from "zod";
import {
  database,
  transaction,
  id,
  ServiceError,
  type Database,
} from "@/lib/server/db";
import {
  authorize,
  issueChallenge,
  consumeChallenge,
  sessionWallet,
  checkOrigin,
  requireRole,
  digest,
  limit,
} from "@/lib/server/auth";
import {
  kindOf,
  listRecords,
  getRecord,
  saveRecord,
  audit,
  proposeDestinationChange,
  confirmDestinationChange,
  confirmHistoryReconciliation,
  revokeAcceptance,
  lockOrganization,
} from "@/lib/server/records";
import { storeDocument, openDocument } from "@/lib/server/documents";
import { githubPullRequest } from "@/lib/integrations/github";
import { readSafe } from "@/lib/integrations/chain";
import { authorizePreparedPayment } from "@/lib/server/authorization";
import { buildPaymentReceipt } from "@/lib/server/receipts";
import { attachDestinationRelayTransaction } from "@/lib/integrations/relay";
import { overrideInvoice } from "@/lib/server/overrides";
import { accountingExport, csvCell } from "@/lib/server/export";
import { buildCashPlan } from "@/lib/server/planning";
import { extractDocument } from "@/lib/server/extraction";
import { proposeDecisionWithModel, decisionEvidence } from "@/lib/integrations/agent";
import { importInvoices } from "@/lib/server/intake";
import { evaluateInvoice, preparePayment } from "@/lib/server/review";
import {
  operationsDesk,
  saveOperationsPreferences,
  updateOperationsCase,
  accountingClose,
  closeCsv,
} from "@/lib/server/operations";
import {
  listCapabilities,
  revokeCapability,
  removeMember,
  paymentDetails,
  invoiceBalance,
  issueVendorLink,
  issueIntakeKey,
  updateMember,
} from "@/lib/server/access";
import { inspectActivation } from "@/lib/server/activation";
import {
  probeWorkspaceDatabase,
  workspaceConfiguration,
} from "@/lib/server/workspace-readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = z.uuid();
async function boundedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ServiceError(
          413,
          "BODY_TOO_LARGE",
          "The request is too large.",
        );
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
async function json(request: Request) {
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 1048576)),
    );
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(400, "JSON", "Send valid JSON.");
  }
}

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const method = request.method;
    if (path[0] === "health")
      return reply({
        service: "countersign",
        status: "ok",
        version: "0.3.0",
        workspaceConfigured: workspaceConfiguration().workspaceConfigured,
        executionEnabled: false,
      });
    const db = database();
    if (path[0] === "ready") {
      const report = workspaceConfiguration();
      if (!report.workspaceConfigured)
        throw new ServiceError(
          503,
          "WORKSPACE_CONFIGURATION",
          "Complete the private database, document encryption and sign-in origin configuration.",
        );
      const client = await db.connect();
      try {
        const checked = await probeWorkspaceDatabase(client, report);
        if (!checked.databaseVerified)
          throw new ServiceError(
            503,
            "DATABASE_SCHEMA",
            "Database schema is not ready for this release. Apply the dedicated database migrations and repeat the check.",
          );
        return reply({
          database: "ready",
          schema: "verified",
          execution: "gated",
        });
      } finally {
        client.release();
      }
    }
    if (path[0] === "auth") {
      if (method === "POST") checkOrigin(request);
      if (path[1] === "challenge" && method === "POST") {
        const { wallet } = z
          .object({ wallet: z.string().max(42) })
          .parse(await json(request));
        return reply(await issueChallenge(db, wallet));
      }
      if (path[1] === "verify" && method === "POST") {
        const body = z
          .object({
            challengeId: uuid,
            signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
          })
          .parse(await json(request));
        const token = await transaction((tx) =>
          consumeChallenge(
            tx,
            body.challengeId,
            body.signature as `0x${string}`,
          ),
        );
        return new Response(JSON.stringify({ authenticated: true }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": `cs_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
          },
        });
      }
      if (path[1] === "logout" && method === "POST") {
        const token = request.headers
          .get("cookie")
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("cs_session="))
          ?.slice(11);
        if (token)
          await db.query("DELETE FROM sessions WHERE token_hash=$1", [
            digest(token),
          ]);
        return new Response(null, {
          status: 204,
          headers: {
            "Set-Cookie":
              "cs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        });
      }
      if (path[1] === "me" && method === "GET") {
        const wallet = await sessionWallet(db, request);
        return reply({
          wallet,
          organizations: (
            await db.query(
              "SELECT o.id,o.name,m.role FROM organizations o JOIN members m ON m.organization_id=o.id WHERE m.wallet=$1",
              [wallet],
            )
          ).rows,
        });
      }
    }
    if (path[0] === "organizations" && path.length === 1 && method === "POST") {
      checkOrigin(request);
      const wallet = await sessionWallet(db, request),
        body = z
          .object({ name: z.string().trim().min(1).max(120) })
          .parse(await json(request));
      await limit(db, `org:${wallet}`, 5, 86400);
      return reply(
        await transaction(async (tx) => {
          const organizationId = id();
          await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
            organizationId,
            body.name,
          ]);
          await tx.query(
            "INSERT INTO members(organization_id,wallet,role) VALUES($1,$2,'owner')",
            [organizationId, wallet],
          );
          return { id: organizationId, name: body.name, role: "owner" };
        }),
        201,
      );
    }
    if (path[0] === "vendor") {
      return vendorRequest(db, request, path);
    }
    if (path[0] === "intake" && method === "POST") {
      return intakeRequest(db, request);
    }
    if (path[0] !== "organizations" || !path[1])
      throw new ServiceError(404, "NOT_FOUND", "Endpoint not found.");
    const organizationId = uuid.parse(path[1]),
      actor = await authorize(db, request, organizationId);
    if (method !== "GET") checkOrigin(request);
    await limit(db, `api:${actor.wallet}`, 120);
    if (path[2] === "activation" && method === "GET") {
      requireRole(actor, ["owner"]);
      const probe = new URL(request.url).searchParams.get("probe");
      if (probe !== null && probe !== "database")
        throw new ServiceError(
          400,
          "PROBE",
          "Only the read-only database probe is available here.",
        );
      const report = inspectActivation({ profile: "web", organizationId });
      if (probe === null) return reply(report);
      const client = await db.connect();
      try {
        return reply(await probeWorkspaceDatabase(client, report));
      } finally {
        client.release();
      }
    }
    if (
      path[2] === "acceptances" &&
      path[3] &&
      path[4] === "revoke" &&
      method === "POST"
    ) {
      const body = z
        .object({
          expectedVersion: z.number().int().positive(),
          reason: z.string().trim().min(12).max(2000),
        })
        .strict()
        .parse(await json(request));
      return reply(
        await transaction((tx) =>
          revokeAcceptance(
            tx,
            actor,
            uuid.parse(path[3]),
            body.expectedVersion,
            body.reason,
          ),
        ),
      );
    }
    if (path[2] === "operations") {
      if (method === "GET" && !path[3])
        return reply(await operationsDesk(db, actor));
      if (method === "PUT" && path[3] === "preferences") {
        const body = await json(request);
        return reply(
          await transaction((tx) => saveOperationsPreferences(tx, actor, body)),
        );
      }
      if (method === "PUT" && path[3] === "cases" && path[4]) {
        const body = await json(request);
        return reply(
          await transaction((tx) =>
            updateOperationsCase(tx, actor, uuid.parse(path[4]), body),
          ),
        );
      }
      if (method === "GET" && path[3] === "close") {
        const query = new URL(request.url).searchParams;
        const close = await accountingClose(db, actor, {
          from: query.get("from"),
          through: query.get("through"),
        });
        if (query.get("format") === "csv")
          return new Response(closeCsv(close), {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="countersign-close-${close.period.from}-${close.period.through}.csv"`,
              "Cache-Control": "no-store",
            },
          });
        return new Response(JSON.stringify(close, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="countersign-close-${close.period.from}-${close.period.through}.json"`,
            "Cache-Control": "no-store",
          },
        });
      }
    }
    if (
      path[2] === "payments" &&
      path[3] &&
      path.length === 4 &&
      method === "GET"
    )
      return reply(await paymentDetails(db, actor, uuid.parse(path[3])));
    if (
      path[2] === "invoices" &&
      path[3] &&
      path[4] === "balance" &&
      method === "GET"
    )
      return reply(await invoiceBalance(db, actor, uuid.parse(path[3])));
    if (path[2] === "vendor-links" || path[2] === "intake-keys") {
      if (method === "GET" && !path[3])
        return reply(await listCapabilities(db, actor, path[2]));
      if (method === "POST" && path[3] && path[4] === "revoke")
        return reply(
          await transaction((tx) =>
            revokeCapability(
              tx,
              actor,
              path[2] as "vendor-links" | "intake-keys",
              uuid.parse(path[3]),
            ),
          ),
        );
    }
    if (
      path[2] === "members" &&
      path[3] &&
      path[4] === "remove" &&
      method === "POST"
    )
      return reply(await transaction((tx) => removeMember(tx, actor, path[3])));
    if (
      path[2] === "payments" &&
      path[3] &&
      path[4] === "receipt" &&
      method === "GET"
    ) {
      const paymentId = uuid.parse(path[3]);
      return new Response(
        JSON.stringify(
          await buildPaymentReceipt(db, actor, paymentId),
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="countersign-${paymentId}-receipt.json"`,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (
      path[2] === "payments" &&
      path[3] &&
      path[4] === "relay-transaction" &&
      method === "POST"
    ) {
      const paymentId = uuid.parse(path[3]),
        body = z
          .object({
            transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
            note: z.string().min(10).max(2000),
          })
          .parse(await json(request));
      return reply(
        await transaction((tx) =>
          attachDestinationRelayTransaction(
            tx,
            actor,
            paymentId,
            body.transactionHash as `0x${string}`,
            body.note,
          ),
        ),
      );
    }
    if (path[2] === "snapshot" && method === "GET") {
      const rows = (
        await db.query(
          "SELECT kind,id,version,body,created_at,updated_at FROM records WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 2000",
          [organizationId],
        )
      ).rows;
      const payments = (
        await db.query(
          "SELECT id,invoice_id,amount,state,source_tx,destination_tx,created_at FROM payment_intents WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
          [organizationId],
        )
      ).rows;
      const events = (
        await db.query(
          "SELECT action,actor,entity_id,details,created_at FROM audit_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
          [organizationId],
        )
      ).rows;
      return reply({
        records: rows,
        payments,
        events,
        role: actor.role,
        executionEnabled: false,
      });
    }
    if (path[2] === "records") {
      const kind = kindOf(path[3]);
      if (method === "GET")
        return reply(
          path[4]
            ? await getRecord(db, actor, kind, uuid.parse(path[4]))
            : await listRecords(db, actor, kind),
        );
      if (method === "POST" || method === "PUT") {
        const body = await json(request);
        return reply(
          await transaction((tx) =>
            saveRecord(
              tx,
              actor,
              kind,
              body.body ?? body,
              path[4] ? uuid.parse(path[4]) : undefined,
              body.expectedVersion,
            ),
          ),
          method === "POST" ? 201 : 200,
        );
      }
    }
    if (path[2] === "override" && method === "POST") {
      const token =
        request.headers
          .get("cookie")
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("cs_session="))
          ?.slice(11) ?? "";
      const body = await json(request);
      return reply(
        await transaction((tx) => overrideInvoice(tx, actor, body, token)),
      );
    }
    if (path[2] === "plan" && method === "POST") {
      const { policyId } = z
        .object({ policyId: uuid })
        .parse(await json(request));
      return reply(
        await transaction((tx) => buildCashPlan(tx, actor, policyId)),
      );
    }
    if (path[2] === "history-reconciliation" && method === "POST") {
      const body = z
        .object({
          safeId: uuid,
          observationId: uuid,
          sourceDocumentIds: z.array(uuid).min(1).max(100),
          statement: z.string().min(1).max(8000),
          transfers: z
            .array(
              z.object({
                transactionHash: z.string(),
                logIndex: z.number().int().nonnegative(),
                classification: z.enum([
                  "countersign",
                  "external_invoice",
                  "non_payable",
                ]),
                paymentId: uuid.optional(),
                invoiceId: uuid.optional(),
                reason: z.string(),
              }),
            )
            .max(1000),
        })
        .parse(await json(request));
      const sessionToken =
        request.headers
          .get("cookie")
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("cs_session="))
          ?.slice(11) ?? "";
      return reply(
        await transaction((tx) =>
          confirmHistoryReconciliation(tx, actor, body, { sessionToken }),
        ),
      );
    }
    if (path[2] === "authorize" && method === "POST") {
      const { paymentId } = z
        .object({ paymentId: uuid })
        .parse(await json(request));
      return reply(
        await transaction((tx) =>
          authorizePreparedPayment(tx, actor, paymentId),
        ),
      );
    }
    if (path[2] === "destination-changes") {
      const sessionToken =
        request.headers
          .get("cookie")
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("cs_session="))
          ?.slice(11) ?? "";
      if (method === "GET") {
        requireRole(actor, ["owner", "approver"]);
        return reply(
          (
            await db.query(
              "SELECT id,vendor_id,destination,chain_id,reason,proposed_by,solo_exception_reason,status,created_at,expires_at FROM destination_changes WHERE organization_id=$1 ORDER BY created_at DESC",
              [organizationId],
            )
          ).rows,
        );
      }
      if (method === "POST" && path[3] === "confirm") {
        const { changeId } = z
          .object({ changeId: uuid })
          .parse(await json(request));
        return reply(
          await transaction((tx) =>
            confirmDestinationChange(tx, actor, changeId, { sessionToken }),
          ),
        );
      }
      if (method === "POST") {
        const body = z
          .object({
            vendorId: uuid,
            expectedVersion: z.number().int().positive(),
            destination: z.string(),
            chainId: z.number().int().positive(),
            reason: z.string(),
            soloExceptionReason: z.string().optional(),
          })
          .parse(await json(request));
        return reply(
          await transaction((tx) =>
            proposeDestinationChange(tx, actor, body, { sessionToken }),
          ),
        );
      }
    }
    if (path[2] === "extract" && method === "POST") {
      const body = z
        .object({
          documentId: uuid,
          kind: z.enum(["agreement", "invoice"]).default("agreement"),
        })
        .parse(await json(request));
      await limit(db, `model:${organizationId}`, 20, 3600);
      return reply(
        await extractDocument(db, actor, body.documentId, body.kind),
      );
    }
    if (path[2] === "agent-review" && method === "POST") {
      requireRole(actor, ["owner", "approver", "operator"]);
      const body = z.object({ invoiceId: uuid }).parse(await json(request));
      if (!process.env.MODEL_API_KEY || !process.env.MODEL_NAME)
        throw new ServiceError(
          503,
          "MODEL_CONFIG",
          "The evidence assistant is not configured. Deterministic verification remains available.",
        );
      await limit(db, `model:${organizationId}`, 20, 3600);
      const result = await transaction((tx) =>
        evaluateInvoice(tx, actor, body.invoiceId),
      );
      const decision = result.decision;
      const evidence = decisionEvidence(result.input, decision);
      const proposal = await proposeDecisionWithModel({
        decision,
        evidence,
        apiKey: process.env.MODEL_API_KEY,
        model: process.env.MODEL_NAME,
      });
      const proposalId = id();
      const binding = {
        invoiceId: decision.invoiceId, invoiceVersion: decision.invoiceVersion,
        engagementId: decision.engagementId, engagementVersion: decision.engagementVersion,
        policyVersion: decision.policyVersion, evaluatedAt: decision.evaluatedAt, validUntil: decision.validUntil,
      };
      const saved = { id: proposalId, ...proposal, decisionId: result.id, binding, evidence };
      await transaction(async (tx) => {
        await lockOrganization(tx, actor);
        await tx.query(
        "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'agent_proposal',$2,$3,$4)",
        [
          organizationId,
          proposalId,
          JSON.stringify(saved),
          actor.wallet,
        ],
        );
        await audit(tx, actor, "agent.proposed", body.invoiceId, { proposalId, decisionId: result.id, authority: proposal.authority, binding });
      });
      return reply(saved);
    }
    if (path[2] === "import" && method === "POST") {
      const body = z
        .object({
          csv: z.string().max(1048576),
          dryRun: z.boolean().default(true),
        })
        .parse(await json(request));
      return reply(
        await transaction((tx) =>
          importInvoices(tx, actor, body.csv, body.dryRun),
        ),
      );
    }
    if (path[2] === "github-evidence" && method === "POST") {
      requireRole(actor, ["owner", "approver", "operator"]);
      const body = z
        .object({
          invoiceId: uuid,
          owner: z.string(),
          repo: z.string(),
          number: z.number().int().positive(),
        })
        .parse(await json(request));
      await getRecord(db, actor, "invoice", body.invoiceId);
      const evidence = await githubPullRequest({
        owner: body.owner,
        repo: body.repo,
        number: body.number,
      });
      return reply(
        await transaction((tx) =>
          saveRecord(tx, actor, "evidence", {
            invoiceId: body.invoiceId,
            kind: "github",
            summary: `${evidence.title}. Merged: ${evidence.merged}. Activity only; not customer acceptance.`,
            source: evidence.sourceUrl,
            observedAt: evidence.observedAt,
            commitment: evidence.hash,
          }),
        ),
      );
    }
    if (path[2] === "safe-sync" && method === "POST") {
      requireRole(actor, ["owner", "approver", "operator"]);
      const { safeId } = z.object({ safeId: uuid }).parse(await json(request));
      const safe = await getRecord(db, actor, "safe", safeId);
      if (
        Number(safe.body.chainId) !==
          Number(process.env.ARC_CHAIN_ID ?? 5042002) ||
        !process.env.ARC_RPC_URL ||
        !process.env.USDC_TOKEN_ADDRESS
      )
        throw new ServiceError(
          503,
          "CHAIN_CONFIG",
          "Configure and verify the RPC, chain ID and USDC token deployment before synchronization.",
        );
      const observation = await readSafe({
        rpcUrl: process.env.ARC_RPC_URL,
        chainId: Number(safe.body.chainId),
        safe: String(safe.body.address) as `0x${string}`,
        token: process.env.USDC_TOKEN_ADDRESS as `0x${string}`,
      });
      const recordId = id();
      await db.query(
        "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'chain_observation',$2,$3,$4)",
        [
          organizationId,
          recordId,
          JSON.stringify({ ...observation, safeId }),
          actor.wallet,
        ],
      );
      await audit(db, actor, "safe.observed", safeId, {
        recordId,
        historyComplete: observation.historyComplete,
      });
      return reply(observation);
    }
    if (path[2] === "review" && method === "POST") {
      requireRole(actor, ["owner", "approver", "operator"]);
      const { invoiceId, requestedAmount } = z
        .object({
          invoiceId: uuid,
          requestedAmount: z
            .string()
            .regex(/^(0|[1-9][0-9]{0,35})$/)
            .optional(),
        })
        .parse(await json(request));
      return reply(
        await transaction((tx) =>
          evaluateInvoice(tx, actor, invoiceId, undefined, requestedAmount),
        ),
      );
    }
    if (path[2] === "prepare" && method === "POST") {
      requireRole(actor, ["owner", "approver", "operator"]);
      const { invoiceId, key, requestedAmount } = z
        .object({
          invoiceId: uuid,
          key: z.string().min(8).max(160),
          requestedAmount: z
            .string()
            .regex(/^(0|[1-9][0-9]{0,35})$/)
            .optional(),
        })
        .parse(await json(request));
      return reply(
        await transaction((tx) =>
          preparePayment(tx, actor, invoiceId, key, requestedAmount),
        ),
      );
    }
    if (path[2] === "intake-events" && method === "GET")
      return reply(
        (
          await db.query(
            "SELECT external_id,body,created_at FROM intake_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
            [organizationId],
          )
        ).rows,
      );
    if (path[2] === "documents") {
      if (method === "GET" && !path[3])
        return reply(
          (
            await db.query(
              "SELECT id,filename,mime,byte_length,commitment,created_at FROM documents WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
              [organizationId],
            )
          ).rows,
        );
      if (method === "POST") {
        if (Number(request.headers.get("content-length") ?? 0) > 4200000)
          throw new ServiceError(
            413,
            "FILE_SIZE",
            "Upload must be smaller than 4 MB.",
          );
        const content = await boundedBody(request, 4200000);
        const form = await new Response(content, {
          headers: {
            "Content-Type": request.headers.get("content-type") ?? "",
          },
        }).formData();
        const file = form.get("file");
        if (!(file instanceof File))
          throw new ServiceError(400, "FILE", "Choose a document.");
        return reply(
          await transaction((tx) => storeDocument(tx, actor, file)),
          201,
        );
      }
      if (method === "GET" && path[3]) {
        const doc = (
          await db.query<{
            filename: string;
            mime: string;
            ciphertext: Buffer;
            iv: Buffer;
            tag: Buffer;
          }>(
            "SELECT filename,mime,ciphertext,iv,tag FROM documents WHERE id=$1 AND organization_id=$2",
            [uuid.parse(path[3]), organizationId],
          )
        ).rows[0];
        if (!doc)
          throw new ServiceError(404, "DOCUMENT", "Document not found.");
        return new Response(new Uint8Array(openDocument(doc, organizationId)), {
          headers: {
            "Content-Type": doc.mime,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    if (path[2] === "members") {
      requireRole(actor, ["owner"]);
      if (method === "GET")
        return reply(
          (
            await db.query(
              "SELECT wallet,role FROM members WHERE organization_id=$1",
              [organizationId],
            )
          ).rows,
        );
      if (method === "POST") {
        const body = z
          .object({
            wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
            role: z.enum(["approver", "operator", "viewer"]),
          })
          .parse(await json(request));
        return reply(
          await transaction((tx) =>
            updateMember(tx, actor, body.wallet, body.role),
          ),
        );
      }
    }
    if (path[2] === "vendor-links" && method === "POST") {
      requireRole(actor, ["owner", "approver"]);
      const body = z.object({ caseId: uuid }).parse(await json(request));
      return reply(
        await transaction((tx) => issueVendorLink(tx, actor, body.caseId)),
      );
    }
    if (path[2] === "intake-keys" && method === "POST") {
      requireRole(actor, ["owner"]);
      const body = z
        .object({ label: z.string().min(1).max(120) })
        .parse(await json(request));
      return reply(
        await transaction((tx) => issueIntakeKey(tx, actor, body.label)),
      );
    }
    if (path[2] === "export" && method === "GET") {
      const rows = await accountingExport(db, actor);
      if (new URL(request.url).searchParams.get("format") === "csv") {
        const columns = rows.length
          ? Object.keys(rows[0])
          : [
              "payment_id",
              "invoice_id",
              "invoice_reference",
              "vendor_reference",
              "vendor_name",
              "engagement_id",
              "source_currency",
              "source_atomic_amount",
              "settlement_asset",
              "settlement_atomic_amount",
              "fee_atomic_units",
              "source_chain_id",
              "destination_chain_id",
              "recipient",
              "source_transaction",
              "destination_transaction",
              "approval_reference",
              "reconciliation_status",
              "created_at",
              "settled_at",
            ];
        const csv = [
          columns.join(","),
          ...rows.map((r) =>
            columns.map((c) => csvCell(r[c as keyof typeof r])).join(","),
          ),
        ].join("\r\n");
        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="countersign-payments.csv"',
            "Cache-Control": "no-store",
          },
        });
      }
      return reply({ schemaVersion: 1, cohort: "workspace", payments: rows });
    }
    throw new ServiceError(404, "NOT_FOUND", "Endpoint not found.");
  } catch (error) {
    if (error instanceof ServiceError)
      return reply(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof z.ZodError)
      return reply(
        {
          error: {
            code: "VALIDATION",
            message: "Check the highlighted fields.",
            issues: error.issues.map((x) => ({
              field: x.path.join("."),
              message: x.message,
            })),
          },
        },
        400,
      );
    if ((error as { code?: string })?.code === "23505")
      return reply(
        {
          error: {
            code: "CONFLICT",
            message:
              "This operation already exists or conflicts with a committed record. Refresh to see the current state.",
          },
        },
        409,
      );
    console.error("request_failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    return reply(
      {
        error: {
          code: "UNAVAILABLE",
          message:
            "The service could not confirm completion. Refresh the record and retry with the same operation identity.",
        },
      },
      503,
    );
  }
}
async function vendorRequest(db: Database, request: Request, path: string[]) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    throw new ServiceError(
      401,
      "VENDOR_LINK",
      "Open the private link provided by your customer.",
    );
  const row = (
    await db.query<{
      organization_id: string;
      vendor_id: string;
      case_id: string;
    }>(
      "SELECT organization_id,vendor_id,case_id FROM vendor_links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
      [digest(token)],
    )
  ).rows[0];
  if (!row)
    throw new ServiceError(
      401,
      "VENDOR_LINK_EXPIRED",
      "This link expired or was revoked. Ask your customer for a new link.",
    );
  await limit(db, `vendor:${digest(token)}`, 20);
  const actor = {
    wallet: "vendor-link",
    organizationId: row.organization_id,
    role: "viewer" as const,
  };
  const record = await getRecord(db, actor, "case", row.case_id);
  if (request.method === "GET") {
    return reply({
      title: record.body.title,
      reason: record.body.reason,
      status: record.body.status,
      resolution: record.body.resolution,
    });
  }
  if (request.method === "POST" && path[1] === "correction") {
    checkOrigin(request);
    const body = z
      .object({ correction: z.string().trim().min(1).max(8000) })
      .parse(await json(request));
    const correctionId = id();
    await db.query(
      "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'vendor_correction',$2,$3,'vendor-link')",
      [
        row.organization_id,
        correctionId,
        JSON.stringify({
          caseId: row.case_id,
          vendorId: row.vendor_id,
          correction: body.correction,
          status: "untrusted_proposal",
        }),
      ],
    );
    await audit(db, actor, "vendor.correction_submitted", row.case_id);
    return reply({
      received: true,
      notice:
        "Your customer will review this correction. Approved terms and payment destinations have not changed.",
    });
  }
  throw new ServiceError(404, "NOT_FOUND", "Endpoint not found.");
}
async function intakeRequest(db: Database, request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    throw new ServiceError(401, "INTAKE_KEY", "An intake API key is required.");
  const key = (
    await db.query<{ organization_id: string }>(
      "SELECT organization_id FROM intake_keys WHERE token_hash=$1 AND revoked_at IS NULL",
      [digest(token)],
    )
  ).rows[0];
  if (!key)
    throw new ServiceError(
      401,
      "INTAKE_KEY",
      "The intake key is invalid or revoked.",
    );
  await limit(db, `intake:${digest(token)}`, 30);
  const body = z
    .object({
      externalId: z.string().min(1).max(200),
      sender: z.string().max(320),
      subject: z.string().max(500),
      text: z.string().max(50000),
      provider: z.string().max(80),
    })
    .parse(await json(request));
  const result = await db.query(
    "INSERT INTO intake_events(organization_id,external_id,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING external_id",
    [
      key.organization_id,
      body.externalId,
      JSON.stringify({ ...body, trust: "untrusted_source_not_authorization" }),
    ],
  );
  return reply(
    {
      received: true,
      duplicate: result.rows.length === 0,
      notice:
        "Queued as untrusted intake. No terms or payment authority were changed.",
    },
    202,
  );
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
