import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  atomic,
  commitment,
  planCommitments,
  type Decision,
  type VerificationInput,
} from "../domain";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
} from "../integrations/manifest";
import type { Actor } from "./auth";
import type { Database } from "./db";
import { lockOrganization } from "./records";
import { evaluateInvoice, preparePayment } from "./review";
import { authorizePreparedPayment } from "./authorization";

type RecordRow = {
  id: string;
  version: number;
  body: Record<string, unknown>;
  created_by: string;
};
type Pending = {
  id: string;
  invoice_id: string;
  engagement_id: string;
  state: string;
  amount: string;
  permit: Record<string, unknown>;
  source_tx: string | null;
  destination_tx: string | null;
  source_confirmed_at: string | null;
  terminal_failure_proof: string | null;
  invalidated_at: string | null;
};
type Assessment = { id: string; decision: Decision; input: VerificationInput };
export type AutomationDependencies = {
  evaluate: (
    db: Database,
    actor: Actor,
    invoiceId: string,
    excludePaymentId?: string,
  ) => Promise<Assessment>;
  prepare: (
    db: Database,
    actor: Actor,
    invoiceId: string,
    key: string,
  ) => Promise<{ id: string; state: string }>;
  authorize: (
    db: Database,
    actor: Actor,
    paymentId: string,
  ) => Promise<{ id: string; state: string; awaitingCoverage?: boolean }>;
  assertReady: (organizationId: string) => Promise<void>;
};
export const standingAutomationDependencies: AutomationDependencies = {
  evaluate: evaluateInvoice,
  prepare: preparePayment,
  authorize: authorizePreparedPayment,
  assertReady: async (organizationId) => {
    if (process.env.EXECUTION_ENABLED !== "true")
      throw new Error("Execution activation is off");
    const manifest = await loadDeploymentManifest(),
      rpc = process.env.SOURCE_RPC_URL || process.env.ARC_RPC_URL;
    if (!manifest || manifest.organizationId !== organizationId || !rpc)
      throw new Error(
        "Verified deployment is not configured for this organization",
      );
    await verifyDeploymentManifest(manifest, rpc);
  },
};
const paidOrCanceled = (row: RecordRow) =>
  ["paid", "canceled"].includes(String(row.body.status));
const released = (p: Pending) =>
  p.state === "failed" &&
  Boolean(p.terminal_failure_proof?.trim()) &&
  !p.source_tx &&
  !p.destination_tx;
function meaningfulFindings(d: Decision) {
  return d.findings.filter((f) => f.severity !== "info");
}
function onlyCoverage(d: Decision) {
  const findings = meaningfulFindings(d);
  return findings.length === 1 && findings[0].code === "COVERAGE_REQUIRED";
}
async function outcome(
  db: Database,
  org: string,
  invoice: RecordRow,
  action: string,
  reason: string,
  details: Record<string, unknown>,
  notify: boolean,
) {
  const fingerprint = commitment({
    invoiceVersion: invoice.version,
    action,
    reason,
    details,
  });
  const previous = (
    await db.query<{ body: Record<string, unknown>; version: number }>(
      "SELECT body,version FROM records WHERE organization_id=$1 AND kind='automation_outcome' AND id=$2",
      [org, invoice.id],
    )
  ).rows[0];
  if (previous?.body.fingerprint === fingerprint) return false;
  const body = {
    invoiceId: invoice.id,
    action,
    reason,
    ...details,
    fingerprint,
    observedAt: new Date().toISOString(),
  };
  if (previous)
    await db.query(
      "INSERT INTO record_versions(organization_id,kind,id,version,body,actor) VALUES($1,'automation_outcome',$2,$3,$4,'system:standing-delegation') ON CONFLICT DO NOTHING",
      [org, invoice.id, previous.version, JSON.stringify(previous.body)],
    );
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'automation_outcome',$2,$3,'system:standing-delegation') ON CONFLICT(organization_id,kind,id) DO UPDATE SET body=EXCLUDED.body,version=records.version+1,updated_at=now()",
    [org, invoice.id, JSON.stringify(body)],
  );
  if (
    notify &&
    ["HOLD", "ASK", "AWAITING_COVERAGE", "RECOVERY_REQUIRED"].includes(action)
  ) {
    const eventId = randomUUID();
    await db.query(
      "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'notify',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",
      [
        eventId,
        org,
        JSON.stringify({
          eventId,
          kind:
            action === "RECOVERY_REQUIRED"
              ? "stuck_payment"
              : action === "AWAITING_COVERAGE"
                ? "coverage_capacity"
                : "exception",
          summary: reason.slice(0, 500),
        }),
        `notice:${org}:${invoice.id}:${fingerprint}`,
      ],
    );
  }
  return true;
}
/** Caller owns a transaction. No model/vendor field supplies the background actor: current membership + approved standing terms do. */
export async function runStandingAutomation(
  db: Database,
  options: {
    organizationId: string;
    now?: string;
    notificationsEnabled?: boolean;
  },
  deps: AutomationDependencies = standingAutomationDependencies,
) {
  const org = z.string().uuid().parse(options.organizationId),
    now = options.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now)))
    throw new Error("Invalid automation time");
  const notifications = options.notificationsEnabled === true;
  // A machine identity is used solely for the org serialization lock, never passed to financial authorization.
  await lockOrganization(db, {
    organizationId: org,
    wallet: "system:standing-delegation",
    role: "viewer",
  });
  const [records, members, payments] = await Promise.all([
    db.query<RecordRow & { kind: string }>(
      "SELECT id,kind,version,body,created_by FROM records WHERE organization_id=$1 AND kind IN ('invoice','engagement','policy')",
      [org],
    ),
    db.query<{ wallet: string; role: string }>(
      "SELECT wallet,role FROM members WHERE organization_id=$1",
      [org],
    ),
    db.query<Pending>(
      "SELECT * FROM payment_intents WHERE organization_id=$1",
      [org],
    ),
  ]);
  const invoices = records.rows.filter(
    (r) => r.kind === "invoice" && !paidOrCanceled(r),
  );
  if (invoices.length > 500)
    throw new Error(
      "Standing scan exceeds 500 open invoices; partition the workspace before enabling automatic execution",
    );
  const engagements = new Map(
      records.rows.filter((r) => r.kind === "engagement").map((r) => [r.id, r]),
    ),
    policies = new Map(
      records.rows.filter((r) => r.kind === "policy").map((r) => [r.id, r]),
    );
  const owners = new Set(
    members.rows
      .filter((m) => m.role === "owner")
      .map((m) => m.wallet.toLowerCase()),
  );
  const candidates: Array<{
    invoice: RecordRow;
    engagement: RecordRow;
    policy: RecordRow;
    actor: Actor;
    assessment: Assessment;
    pending?: Pending;
  }> = [];
  const outcomes: Array<{ invoiceId: string; action: string; reason: string }> =
    [];
  for (const invoice of invoices) {
    const engagement = engagements.get(String(invoice.body.engagementId));
    const approver = String(engagement?.body.approvedBy ?? "").toLowerCase();
    const policy = engagement?.body.policyId
      ? policies.get(String(engagement.body.policyId))
      : policies.size === 1
        ? [...policies.values()][0]
        : undefined;
    const ownerAuthorized =
      engagement?.body.approved === true &&
      /^0x[0-9a-f]{40}$/.test(approver) &&
      owners.has(approver);
    if (!engagement || !policy || !ownerAuthorized) {
      const reason =
        "Approved standing terms, an explicit policy, and a current approving owner are required.";
      await outcome(
        db,
        org,
        invoice,
        "ASK",
        reason,
        { engagementVersion: engagement?.version ?? 0 },
        notifications,
      );
      outcomes.push({ invoiceId: invoice.id, action: "ASK", reason });
      continue;
    }
    const pending = payments.rows.filter(
      (p) =>
        p.invoice_id === invoice.id && !released(p) && p.state !== "settled",
    );
    if (pending.length > 1)
      throw new Error(
        "Multiple unresolved operations require independent reconciliation",
      );
    const existing = pending[0];
    if (
      existing &&
      (existing.state !== "prepared" || existing.invalidated_at)
    ) {
      const action =
        ["uncertain", "recovery_required", "failed"].includes(existing.state) ||
        existing.invalidated_at
          ? "RECOVERY_REQUIRED"
          : "IN_PROGRESS";
      const reason =
        "The existing payment operation retains its identity and capacity until reconciled.";
      await outcome(
        db,
        org,
        invoice,
        action,
        reason,
        { paymentId: existing.id, state: existing.state },
        notifications,
      );
      outcomes.push({ invoiceId: invoice.id, action, reason });
      continue;
    }
    const actor: Actor = {
      organizationId: org,
      wallet: approver,
      role: "owner",
    };
    const assessment = await deps.evaluate(db, actor, invoice.id, existing?.id);
    candidates.push({
      invoice,
      engagement,
      policy,
      actor,
      assessment,
      pending: existing,
    });
  }
  const groups = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = String(c.policy.body.safeId);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  let ready: boolean | undefined;
  let readinessReason = "";
  for (const [safeId, group] of groups) {
    const observation = (
      await db.query<{ id: string; body: Record<string, unknown> }>(
        "SELECT id,body FROM records WHERE organization_id=$1 AND kind='chain_observation' AND body->>'safeId'=$2 ORDER BY created_at DESC LIMIT 1",
        [org, safeId],
      )
    ).rows[0];
    const observedAt = Date.parse(String(observation?.body.observedAt));
    const fresh =
      Boolean(observation) &&
      Number.isFinite(observedAt) &&
      observedAt <= Date.parse(now) &&
      Date.parse(now) - observedAt < 300_000;
    const groupPolicies = [...policies.values()].filter(
      (p) => p.body.safeId === safeId,
    );
    let protectedAmount = 0n,
      operating = 0n;
    for (const p of groupPolicies) {
      protectedAmount += atomic(String(p.body.protectedAmount ?? "0"));
      const floor =
        atomic(String(p.body.cashFloor ?? "0")) +
        atomic(String(p.body.feeReserve ?? "0"));
      if (floor > operating) operating = floor;
    }
    const replannedIds = new Set(
      group.flatMap((c) => (c.pending ? [c.pending.id] : [])),
    );
    const policyIds = new Set(
      [...policies.values()]
        .filter((p) => p.body.safeId === safeId)
        .map((p) => p.id),
    );
    let pendingReserve = 0n;
    for (const p of payments.rows) {
      if (p.state === "settled" || released(p) || replannedIds.has(p.id))
        continue;
      if (p.permit.policyId && !policyIds.has(String(p.permit.policyId)))
        continue;
      if (
        !p.source_confirmed_at ||
        Date.parse(p.source_confirmed_at) > observedAt
      )
        pendingReserve += atomic(p.amount);
    }
    const plan = planCommitments({
      confirmedCash: fresh ? String(observation!.body.balance) : "0",
      operatingReserve: operating.toString(),
      protectedReserve: protectedAmount.toString(),
      pendingReserve: pendingReserve.toString(),
      expectedInflows: "0",
      now,
      items: group.map((c) => ({
        id: c.invoice.id,
        amount: c.assessment.decision.amount,
        fee: "0",
        dueAt: `${c.invoice.body.dueDate}T00:00:00Z`,
        priority: 1,
        eligible:
          fresh &&
          (c.assessment.decision.action === "PAY" ||
            onlyCoverage(c.assessment.decision)),
        allowEarly: false,
      })),
    });
    await db.query(
      "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'standing_payment_plan',$2,$3,'system:standing-delegation')",
      [
        org,
        randomUUID(),
        JSON.stringify({
          ...plan,
          safeId,
          observationId: observation?.id ?? null,
          policyVersions: groupPolicies.map((p) => ({
            id: p.id,
            version: p.version,
          })),
        }),
      ],
    );
    for (const item of plan.items) {
      const c = group.find((c) => c.invoice.id === item.id)!;
      let action = item.action,
        reason = item.reason;
      const fields: Record<string, unknown> = {
        engagementVersion: c.engagement.version,
        policyVersion: c.policy.version,
        sourceIds: c.assessment.decision.sourceIds,
        shortfall: item.shortfall,
      };
      if (!fresh) {
        action = "HOLD";
        reason =
          "A fresh confirmed Safe balance and reconciled history are required.";
      } else if (
        c.assessment.decision.action !== "PAY" &&
        !onlyCoverage(c.assessment.decision)
      ) {
        action = c.assessment.decision.action;
        reason = c.assessment.decision.reason;
      } else if (
        item.action === "PAY" &&
        c.engagement.body.mode === "delegate"
      ) {
        if (ready === undefined) {
          try {
            await deps.assertReady(org);
            ready = true;
          } catch (error) {
            ready = false;
            readinessReason =
              error instanceof Error
                ? error.message
                : "Deployment is unavailable";
          }
        }
        if (!ready) {
          action = "HOLD";
          reason = readinessReason;
        } else {
          await db.query("SAVEPOINT standing_authorization");
          try {
            const prepared =
              c.pending ??
              (await deps.prepare(
                db,
                c.actor,
                c.invoice.id,
                `standing:${c.invoice.id}:v${c.invoice.version}`,
              ));
            const authorized = await deps.authorize(db, c.actor, prepared.id);
            fields.paymentId = prepared.id;
            action = authorized.awaitingCoverage
              ? "AWAITING_COVERAGE"
              : "AUTHORIZED";
            reason = authorized.awaitingCoverage
              ? "The exact unsigned permit is awaiting its full on-chain reserved protection allocation."
              : "Due payment authorized under the existing approved standing delegation.";
            await db.query("RELEASE SAVEPOINT standing_authorization");
          } catch (error) {
            await db.query("ROLLBACK TO SAVEPOINT standing_authorization");
            await db.query("RELEASE SAVEPOINT standing_authorization");
            action = "HOLD";
            reason =
              error instanceof Error
                ? error.message
                : "Authorization could not complete; the payment remains unexecuted.";
          }
        }
      } else if (item.action === "PAY") {
        action = "PREPARE";
        reason =
          "This engagement requires existing human signing; no standing execution authority is granted.";
      }
      await outcome(db, org, c.invoice, action, reason, fields, notifications);
      outcomes.push({ invoiceId: c.invoice.id, action, reason });
    }
  }
  return { organizationId: org, scanned: invoices.length, outcomes, at: now };
}

const transferSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  logIndex: z.number().int().nonnegative(),
  from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().regex(/^(0|[1-9]\d*)$/),
  block: z.string().regex(/^(0|[1-9]\d*)$/),
});
const observationSchema = z
  .object({
    safe: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int().positive(),
    balance: z.string().regex(/^(0|[1-9]\d*)$/),
    observedAt: z.string().datetime({ offset: true }),
    finalizedBlock: z.string().regex(/^(0|[1-9]\d*)$/),
    finalizedBlockHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    historyFrom: z.string().regex(/^(0|[1-9]\d*)$/),
    incrementalHistoryComplete: z.boolean().optional(),
    transfers: z.array(transferSchema).max(20000),
  })
  .passthrough();
/** Read-only worker observations extend an existing owner-backed baseline only with complete incremental matching. */
export async function persistStandingObservation(
  db: Database,
  config: {
    organizationId: string;
    safe: string;
    chainId: number;
    sourceAdapter?: string;
  },
  raw: unknown,
  previousBlockCanonical: (block: string, hash: string) => Promise<boolean>,
) {
  const observation = observationSchema.parse(raw),
    org = z.string().uuid().parse(config.organizationId);
  if (
    observation.safe.toLowerCase() !== config.safe.toLowerCase() ||
    observation.chainId !== config.chainId ||
    Date.parse(observation.observedAt) > Date.now() ||
    Date.now() - Date.parse(observation.observedAt) > 300_000
  )
    throw new Error(
      "Standing observation does not match configured current chain and Safe",
    );
  await lockOrganization(db, {
    organizationId: org,
    wallet: "system:chain-observer",
    role: "viewer",
  });
  const safe = (
    await db.query<RecordRow>(
      "SELECT id,version,body,created_by FROM records WHERE organization_id=$1 AND kind='safe' AND lower(body->>'address')=$2 AND body->>'chainId'=$3",
      [org, config.safe.toLowerCase(), String(config.chainId)],
    )
  ).rows;
  if (safe.length !== 1)
    throw new Error(
      "Select one exact Safe record before automated synchronization",
    );
  const safeId = safe[0].id;
  const previous = (
    await db.query<RecordRow>(
      "SELECT o.id,o.version,o.body,o.created_by FROM records o WHERE o.organization_id=$1 AND o.kind='chain_observation' AND o.body->>'safeId'=$2 AND EXISTS (SELECT 1 FROM records r WHERE r.organization_id=$1 AND r.kind='history_reconciliation' AND r.body->>'observationId'=o.id::text) ORDER BY o.created_at DESC LIMIT 1",
      [org, safeId],
    )
  ).rows[0];
  const observationId = randomUUID();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'chain_observation',$2,$3,'system:chain-observer')",
    [org, observationId, JSON.stringify({ ...observation, safeId })],
  );
  const held = (reason: string) => ({
    id: observationId,
    reconciled: false,
    reason,
  });
  if (observation.incrementalHistoryComplete === false)
    return held("Incremental transfer history is incomplete or loses native amount precision; independent owner reconciliation is required.");
  if (!previous)
    return held(
      "Initial historical statements and owner reconciliation are required.",
    );
  const baseline = (
    await db.query<RecordRow>(
      "SELECT id,version,body,created_by FROM records WHERE organization_id=$1 AND kind='history_reconciliation' AND body->>'observationId'=$2 ORDER BY created_at DESC LIMIT 1",
      [org, previous.id],
    )
  ).rows[0];
  if (
    !baseline ||
    !Array.isArray(baseline.body.sourceDocumentIds) ||
    !baseline.body.sourceDocumentIds.length ||
    baseline.body.finalizedBlockHash !== previous.body.finalizedBlockHash
  )
    return held("Previous observation lacks a confirmed historical baseline.");
  const baselineOwner = String(
    baseline.body.baselineAttestedBy ?? baseline.body.attestedBy ?? "",
  ).toLowerCase();
  if (
    !(
      await db.query(
        "SELECT wallet FROM members WHERE organization_id=$1 AND wallet=$2 AND role='owner'",
        [org, baselineOwner],
      )
    ).rows.length
  )
    return held("The historical baseline owner no longer has authority.");
  if (
    BigInt(observation.historyFrom) >
      BigInt(String(previous.body.finalizedBlock)) + 1n ||
    BigInt(observation.finalizedBlock) <
      BigInt(String(previous.body.finalizedBlock)) ||
    !(await previousBlockCanonical(
      String(previous.body.finalizedBlock),
      String(previous.body.finalizedBlockHash),
    ))
  )
    return held(
      "Observation gap or changed finality requires independent historical reconciliation.",
    );
  const outgoing = observation.transfers.filter(
      (t) => t.from.toLowerCase() === config.safe.toLowerCase(),
    ),
    oldTransfers = z.array(transferSchema).parse(previous.body.transfers),
    oldClassifications = Array.isArray(baseline.body.transfers)
      ? (baseline.body.transfers as Array<Record<string, unknown>>)
      : [];
  const key = (t: { transactionHash: string; logIndex: number }) =>
    `${t.transactionHash.toLowerCase()}:${t.logIndex}`;
  const known = (
    await db.query<Pending>(
      "SELECT * FROM payment_intents WHERE organization_id=$1 AND source_confirmed_at IS NOT NULL AND source_tx IS NOT NULL",
      [org],
    )
  ).rows;
  const classifications: Array<Record<string, unknown>> = [];
  const matchedPayments = new Set<string>();
  for (const transfer of outgoing) {
    const old = oldTransfers.find((t) => key(t) === key(transfer)),
      classification = oldClassifications.find(
        (t) =>
          String(t.transactionHash).toLowerCase() ===
            transfer.transactionHash.toLowerCase() &&
          t.logIndex === transfer.logIndex,
      );
    if (
      old &&
      classification &&
      old.amount === transfer.amount &&
      old.to.toLowerCase() === transfer.to.toLowerCase() &&
      old.from.toLowerCase() === transfer.from.toLowerCase()
    ) {
      if (classification.classification === "countersign") {
        const paymentId = String(classification.paymentId);
        if (matchedPayments.has(paymentId))
          return held("Multiple outgoing transfers cannot match one uniquely confirmed operation.");
        matchedPayments.add(paymentId);
      }
      classifications.push(classification);
      continue;
    }
    const matches = known.filter((p) => {
      const permit = p.permit.modulePermit as
        Record<string, unknown> | undefined;
      if (!permit) return false;
      const target =
        permit.sourceChainId === permit.destinationChainId
          ? String(permit.recipient)
          : config.sourceAdapter;
      return (
        p.source_tx?.toLowerCase() === transfer.transactionHash.toLowerCase() &&
        p.amount === transfer.amount &&
        target?.toLowerCase() === transfer.to.toLowerCase()
      );
    });
    if (matches.length !== 1)
      return held(
        "New outgoing transfer has no unique independently confirmed operation match.",
      );
    if (matchedPayments.has(matches[0].id))
      return held("Multiple outgoing transfers cannot match one uniquely confirmed operation.");
    matchedPayments.add(matches[0].id);
    classifications.push({
      transactionHash: transfer.transactionHash,
      logIndex: transfer.logIndex,
      classification: "countersign",
      paymentId: matches[0].id,
      reason:
        "Exact finalized Countersign operation matched by the independent settlement worker.",
    });
  }
  const reconciliationId = randomUUID();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'history_reconciliation',$2,$3,'system:incremental-reconciler')",
    [
      org,
      reconciliationId,
      JSON.stringify({
        safeId,
        observationId,
        finalizedBlockHash: observation.finalizedBlockHash,
        sourceDocumentIds: baseline.body.sourceDocumentIds,
        baselineAttestedBy: baselineOwner,
        baselineReconciliationId:
          baseline.body.baselineReconciliationId ?? baseline.id,
        priorReconciliationId: baseline.id,
        transfers: classifications,
        attestedBy: "system:deterministic-incremental-match",
        scope:
          "owner_historical_baseline_plus_contiguous_finalized_exact_operation_matches",
        limitation:
          "Initial statement completeness remains the responsibility of the original owner attestation; new unknown external transfers cannot be automatically classified.",
      }),
    ],
  );
  return { id: observationId, reconciliationId, reconciled: true };
}
