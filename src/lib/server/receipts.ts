import { keccak256, stringToHex } from "viem";
import { z } from "zod";
import { createReceipt, decisionSchema, type Receipt } from "../domain/receipt";
import { modulePermitSchema, permitDigest } from "../domain/permit";
import { businessEvidenceCommitment } from "../domain/evidence";
import type { VerificationInput } from "../domain/types";
import { type Actor, requireRole } from "./auth";
import { type Database, ServiceError } from "./db";

const uuid = z.string().uuid();
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const transaction = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const positiveChain = z.number().int().positive().safe();
const sourceSchema = z
  .object({
    id: uuid,
    uri: z.string(),
    location: z.string(),
    hash: z.string(),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const inputSchema = z.object({
  tenantId: uuid,
  engagement: z.object({
    id: uuid,
    tenantId: uuid,
    version: z.number().int().positive(),
    asset: z.object({ address, chainId: positiveChain }),
    source: sourceSchema,
  }),
  invoice: z.object({
    id: uuid,
    tenantId: uuid,
    version: z.number().int().positive(),
    engagementId: uuid,
    engagementVersion: z.number().int().positive(),
    obligationId: z.string().min(1),
    destination: z.object({ address, chainId: positiveChain }),
    source: sourceSchema,
  }),
  policy: z.object({
    id: z.string().min(1),
    tenantId: uuid,
    version: z.number().int().positive(),
  }),
  acceptances: z.array(z.object({ id: z.string(), source: sourceSchema })),
});
type ReceiptRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  engagement_id: string;
  amount: string;
  state: string;
  permit: Record<string, unknown>;
  source_tx: string | null;
  destination_tx: string | null;
  source_confirmed_at: Date | string | null;
  settled_at: Date | string | null;
  created_at: Date | string;
  decision_body: Record<string, unknown> | null;
  decision_record_version: number | null;
  ledger_body: Record<string, unknown> | null;
};
const invalid = () =>
  new ServiceError(
    409,
    "RECEIPT_BINDING",
    "The stored decision, permit, and settlement evidence are incomplete or inconsistent. Reconcile this payment before exporting its receipt.",
  );
function date(value: Date | string | null) {
  if (value === null) throw invalid();
  const result = new Date(value).toISOString();
  return z.string().datetime().parse(result);
}
/**
 * Caller must authenticate membership via authorize(). A single tenant-scoped SQL
 * statement reads a consistent committed snapshot. Never re-evaluates mutable terms,
 * invents a destination receipt, contacts a chain, or exports raw decision input.
 */
export async function buildPaymentReceipt(
  db: Database,
  actor: Actor,
  paymentId: string,
): Promise<Receipt> {
  requireRole(actor, ["owner", "approver", "operator", "viewer"]);
  if (!uuid.safeParse(paymentId).success)
    throw new ServiceError(
      400,
      "PAYMENT_ID",
      "A valid payment ID is required.",
    );
  const row = (
    await db.query<ReceiptRow>(
      `SELECT p.*,d.body AS decision_body,d.version AS decision_record_version,l.body AS ledger_body
 FROM payment_intents p
 LEFT JOIN records d ON d.organization_id=p.organization_id AND d.kind='decision' AND d.id::text=p.permit->>'decisionId'
 LEFT JOIN ledger_events l ON l.organization_id=p.organization_id AND l.payment_id=p.id AND l.external_key='settlement:'||p.id::text
 WHERE p.organization_id=$1 AND p.id=$2`,
      [actor.organizationId, paymentId],
    )
  ).rows[0];
  if (!row || row.organization_id !== actor.organizationId)
    throw new ServiceError(404, "NOT_FOUND", "Payment not found.");
  try {
    if (!row.decision_body || row.decision_record_version !== 1)
      throw invalid();
    const decision = decisionSchema.parse(row.decision_body.decision);
    const input = inputSchema.parse(row.decision_body.input);
    const permit = row.permit;
    uuid.parse(permit.decisionId);
    const identities = [
      decision.tenantId,
      input.tenantId,
      input.engagement.tenantId,
      input.invoice.tenantId,
      input.policy.tenantId,
    ];
    if (
      identities.some((id) => id !== actor.organizationId) ||
      decision.invoiceId !== row.invoice_id ||
      decision.engagementId !== row.engagement_id ||
      input.invoice.id !== row.invoice_id ||
      input.engagement.id !== row.engagement_id ||
      input.invoice.engagementId !== row.engagement_id ||
      decision.amount !== row.amount ||
      permit.amount !== row.amount ||
      permit.invoiceVersion !== decision.invoiceVersion ||
      permit.engagementVersion !== decision.engagementVersion ||
      permit.policyVersion !== decision.policyVersion ||
      input.invoice.version !== decision.invoiceVersion ||
      input.invoice.engagementVersion !== decision.engagementVersion ||
      input.engagement.version !== decision.engagementVersion ||
      input.policy.version !== decision.policyVersion ||
      permit.obligationId !== input.invoice.obligationId
    )
      throw invalid();
    if (
      typeof permit.destination !== "string" ||
      permit.destination.toLowerCase() !==
        input.invoice.destination.address.toLowerCase()
    )
      throw invalid();
    decision.sourceIds.forEach((value) => uuid.parse(value));
    decision.findings.forEach((f) => {
      z.string()
        .regex(/^[A-Z0-9_]{1,80}$/)
        .parse(f.code);
      f.sourceIds.forEach((value) => uuid.parse(value));
    });
    let execution: Receipt["execution"];
    let sourceChainId = input.engagement.asset.chainId;
    let destinationChainId = input.invoice.destination.chainId;
    let asset = input.engagement.asset.address;
    let recipient = input.invoice.destination.address;
    let expiresAt = z
      .string()
      .datetime({ offset: true })
      .parse(permit.expiresAt);
    if (permit.modulePermit !== undefined) {
      const p = modulePermitSchema.parse(permit.modulePermit);
      // The validated schema covers every field consumed by this pure commitment helper.
      const expectedEvidence = businessEvidenceCommitment(
        row.decision_body.input as VerificationInput,
      );
      if (
        p.paymentId !== keccak256(stringToHex(row.id)) ||
        p.engagementId !== keccak256(stringToHex(row.engagement_id)) ||
        p.obligationId !== keccak256(stringToHex(input.invoice.obligationId)) ||
        p.evidenceCommitment.toLowerCase() !== expectedEvidence.toLowerCase() ||
        p.recipient.toLowerCase() !== recipient.toLowerCase() ||
        p.token.toLowerCase() !== asset.toLowerCase() ||
        p.amount !== row.amount ||
        p.engagementVersion !== String(decision.engagementVersion) ||
        p.sourceChainId !== String(sourceChainId) ||
        p.destinationChainId !== String(destinationChainId) ||
        p.chainId !== p.sourceChainId
      )
        throw invalid();
      sourceChainId = positiveChain.parse(Number(p.sourceChainId));
      destinationChainId = positiveChain.parse(Number(p.destinationChainId));
      asset = p.token;
      recipient = p.recipient;
      expiresAt = date(new Date(Number(p.expiresAt) * 1000));
      execution = { permit: p, digest: permitDigest(p) };
    }
    let settlement: Receipt["settlement"] = null;
    if (row.state === "settled") {
      if (
        !execution ||
        !row.ledger_body ||
        !decision.executable ||
        decision.action !== "PAY"
      )
        throw invalid();
      transaction.parse(row.source_tx);
      const sourceAt = date(row.source_confirmed_at),
        settledAt = date(row.settled_at);
      if (
        Date.parse(sourceAt) < Date.parse(decision.evaluatedAt) ||
        Date.parse(settledAt) < Date.parse(sourceAt)
      )
        throw invalid();
      const crossChain = sourceChainId !== destinationChainId;
      const settledTransaction = transaction.parse(
        crossChain ? row.destination_tx : row.source_tx,
      );
      const ledger = row.ledger_body;
      const postings = z
        .array(
          z.object({
            account: z.string(),
            asset: z.string(),
            units: z.string(),
            side: z.enum(["debit", "credit"]),
          }),
        )
        .parse(ledger.postings);
      if (
        ledger.tenantId !== actor.organizationId ||
        ledger.paymentId !== row.id ||
        ledger.invoiceId !== row.invoice_id ||
        ledger.engagementId !== row.engagement_id ||
        ledger.kind !== "settlement" ||
        ledger.status !== "settled" ||
        String(ledger.network) !== String(destinationChainId) ||
        ledger.transaction !== settledTransaction ||
        postings.length !== 2 ||
        !postings.some(
          (p) =>
            p.account === "accounts_payable" &&
            p.side === "debit" &&
            p.asset === asset &&
            p.units === row.amount,
        ) ||
        !postings.some(
          (p) =>
            p.account === "cash_usdc" &&
            p.side === "credit" &&
            p.asset === asset &&
            p.units === row.amount,
        )
      )
        throw invalid();
      const ledgerAt = z.string().datetime({ offset: true }).parse(ledger.at);
      if (
        Date.parse(ledgerAt) < Date.parse(sourceAt) ||
        Date.parse(ledgerAt) > Date.parse(settledAt)
      )
        throw invalid();
      settlement = {
        paymentId: row.id,
        transaction: settledTransaction,
        chainId: destinationChainId,
        recipient,
        asset,
        amount: row.amount,
        confirmedAt: settledAt,
      };
    }
    // Decision narrative can contain private customer context. Preserve factual
    // versions/actions/codes and opaque IDs; explicitly redact all free-form prose.
    const redactedDecision = {
      ...decision,
      reason: `Recorded ${decision.action} decision. Private narrative omitted from portable export.`,
      nextCheck:
        "Inspect the authenticated workspace for private evidence and current payment state.",
      findings: decision.findings.map((f) => ({
        ...f,
        message: `Recorded finding: ${f.code}. Private narrative omitted.`,
      })),
    };
    return createReceipt({
      id: `payment:${row.id}:decision:${String(permit.decisionId)}:${settlement ? "settled" : "unsettled"}`,
      decision: redactedDecision,
      permit: {
        paymentId: row.id,
        recipient,
        amount: row.amount,
        sourceChainId,
        destinationChainId,
        asset,
        policyVersion: decision.policyVersion,
        engagementVersion: decision.engagementVersion,
        expiresAt,
      },
      ...(execution ? { execution } : {}),
      settlement,
      evidenceCommitments: execution
        ? [execution.permit.evidenceCommitment]
        : [],
      createdAt: settlement?.confirmedAt ?? decision.evaluatedAt,
    });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw invalid();
  }
}
