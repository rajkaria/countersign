import { randomUUID } from "node:crypto";
import { z } from "zod";
import { keccak256, stringToHex, type Hex } from "viem";
import type { Database } from "./db";
import { makeLedgerEvent, type Decision } from "../domain";
import { modulePermitSchema, type ModulePermit } from "../integrations/module";
export type OutboxJob = {
  id: string;
  organization_id: string;
  kind: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
};
export async function claimJob(
  db: Database,
  organizationId?: string,
  kinds?: string[],
): Promise<OutboxJob | null> {
  const result = await db.query<OutboxJob>(
    `WITH candidate AS (SELECT id FROM outbox WHERE completed_at IS NULL AND ($2::uuid IS NULL OR organization_id=$2) AND (($3::text[] IS NULL AND kind<>'operations.notify') OR kind=ANY($3::text[])) AND attempts<8 AND available_at<=now() AND (leased_until IS NULL OR leased_until<now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE outbox o SET leased_until=now()+interval '90 seconds',lease_token=$1,attempts=o.attempts+1 FROM candidate c WHERE o.id=c.id RETURNING o.id,o.organization_id,o.kind,o.payload,o.lease_token,o.attempts`,
    [randomUUID(), organizationId ?? null, kinds ?? null],
  );
  return result.rows[0] ?? null;
}
export async function completeJob(db: Database, job: OutboxJob) {
  const result = await db.query(
    "UPDATE outbox SET completed_at=now(),leased_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2 AND leased_until>now() RETURNING id",
    [job.id, job.lease_token],
  );
  return result.rows.length === 1;
}
export async function failJob(db: Database, job: OutboxJob, reason: string) {
  const delay = Math.min(3600, 2 ** job.attempts * 15);
  await db.query(
    "UPDATE outbox SET leased_until=NULL,available_at=now()+($3 * interval '1 second'),last_error=$4 WHERE id=$1 AND lease_token=$2",
    [job.id, job.lease_token, delay, reason.slice(0, 500)],
  );
}
export async function runWorkerOnce(
  db: Database,
  handler: (job: OutboxJob) => Promise<void>,
  organizationId?: string,
) {
  const job = await claimJob(db, organizationId);
  if (!job) return { status: "idle" as const };
  try {
    await handler(job);
    if (!(await completeJob(db, job)))
      return { status: "lease-lost" as const, jobId: job.id };
    return { status: "completed" as const, jobId: job.id };
  } catch (error) {
    await failJob(
      db,
      job,
      error instanceof Error ? error.message : "Worker failed",
    );
    return {
      status:
        job.attempts >= 8
          ? ("attention-required" as const)
          : ("retry-scheduled" as const),
      jobId: job.id,
    };
  }
}
export type PaymentRow = {
  id: string;
  organization_id: string;
  invoice_id: string;
  engagement_id: string;
  amount: string;
  state: string;
  permit: Record<string, unknown>;
  provider_id: string | null;
  source_tx: string | null;
  destination_tx: string | null;
  invalidated_at?: string | null;
};
export type PaymentWorkerDependencies = {
  revalidate: (payment: PaymentRow) => Promise<Decision>;
  preflight: (permit: ModulePermit) => Promise<void>;
  submit: (request: {
    tenantId: string;
    operationId: string;
    permit: ModulePermit;
    signature: Hex;
  }) => Promise<{
    id: string;
    state: string;
    txHash?: string;
    transactionHash?: string;
  }>;
  lookup: (providerId: string) => Promise<{
    id: string;
    state: string;
    txHash?: string;
    transactionHash?: string;
  } | null>;
  source: (
    transaction: Hex,
    permit: ModulePermit,
  ) => Promise<{ finalized: boolean; crossChain: boolean }>;
  destination?: (
    payment: PaymentRow,
    permit: ModulePermit,
  ) => Promise<{ finalized: boolean; transaction: string }>;
};
/** Financial jobs reference an existing intent; they cannot create new payment identities. */
export async function processPaymentJob(
  db: Database,
  job: OutboxJob,
  deps: PaymentWorkerDependencies,
) {
  if (job.kind !== "payment.execute" && job.kind !== "payment.reconcile")
    throw new Error("Unsupported outbox job");
  const { paymentId } = z
    .object({ paymentId: z.string().uuid() })
    .parse(job.payload);
  const found = await db.query<PaymentRow>(
    "SELECT * FROM payment_intents WHERE id=$1 AND organization_id=$2",
    [paymentId, job.organization_id],
  );
  const payment = found.rows[0];
  if (!payment) throw new Error("Payment not found in job organization");
  if (payment.state === "settled") return;
  const p = modulePermitSchema.parse(payment.permit.modulePermit);
  const signature = z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .parse(payment.permit.verifierSignature) as Hex;
  if (
    p.paymentId !== keccak256(stringToHex(payment.id)) ||
    p.amount !== payment.amount
  )
    throw new Error("Signed permit payment binding mismatch");
  const hasLease = async () => {
    const { rows } = await db.query(
      "SELECT id FROM outbox WHERE id=$1 AND lease_token=$2 AND leased_until>now() AND completed_at IS NULL",
      [job.id, job.lease_token],
    );
    if (!rows.length) throw new Error("Worker lease lost");
  };
  await hasLease();
  if (payment.state === "authorized") {
    if (payment.invalidated_at)
      throw new Error(
        "Authorization invalidated; revoke or expire the signed permit and reevaluate.",
      );
    const decision = await deps.revalidate(payment);
    if (
      !decision.executable ||
      decision.action !== "PAY" ||
      decision.amount !== p.amount ||
      String(decision.engagementVersion) !== p.engagementVersion ||
      decision.policyVersion !== Number(payment.permit.policyVersion) ||
      decision.invoiceVersion !== Number(payment.permit.invoiceVersion) ||
      Date.parse(decision.validUntil) < Number(p.expiresAt) * 1000
    )
      throw new Error(
        "Fresh independent verification does not match signed authorization",
      );
    await deps.preflight(p);
    await hasLease();
    const updated = await db.query(
      "UPDATE payment_intents SET state='submitted',updated_at=now() WHERE id=$1 AND organization_id=$2 AND state='authorized' AND invalidated_at IS NULL RETURNING id",
      [payment.id, job.organization_id],
    );
    if (!updated.rows.length)
      throw new Error("Payment state changed before submission");
    try {
      const tx = await deps.submit({
        tenantId: job.organization_id,
        operationId: payment.id,
        permit: p,
        signature,
      });
      await db.query(
        "UPDATE payment_intents SET provider_id=$3,source_tx=COALESCE($4,source_tx),updated_at=now() WHERE id=$1 AND organization_id=$2",
        [
          payment.id,
          job.organization_id,
          tx.id,
          tx.txHash ?? tx.transactionHash ?? null,
        ],
      );
    } catch {
      await db.query(
        "UPDATE payment_intents SET state='uncertain',updated_at=now() WHERE id=$1 AND organization_id=$2 AND state='submitted'",
        [payment.id, job.organization_id],
      );
      throw new Error(
        "Submission outcome uncertain; reconcile this same operation.",
      );
    }
    throw new Error(
      "Submission recorded; awaiting independent finality reconciliation.",
    );
  }
  if (
    ![
      "submitted",
      "uncertain",
      "source_confirmed",
      "destination_pending",
      "recovery_required",
    ].includes(payment.state)
  )
    throw new Error(
      "Payment requires explicit bounded authorization before worker submission",
    );
  let source = payment.source_tx;
  if (!source && payment.provider_id) {
    const result = await deps.lookup(payment.provider_id);
    source = result?.txHash ?? result?.transactionHash ?? null;
    if (
      result &&
      ["FAILED", "CANCELLED", "DENIED"].includes(result.state.toUpperCase())
    ) {
      await db.query(
        "UPDATE payment_intents SET state='recovery_required',updated_at=now() WHERE id=$1 AND organization_id=$2",
        [payment.id, job.organization_id],
      );
      throw new Error(
        "Provider reports failure; independently prove nonexecution before releasing capacity.",
      );
    }
  }
  if (!source) {
    if (!payment.provider_id)
      await db.query(
        "UPDATE payment_intents SET state='recovery_required',updated_at=now() WHERE id=$1 AND organization_id=$2",
        [payment.id, job.organization_id],
      );
    throw new Error(
      "Existing operation outcome unresolved; no replacement payment is permitted.",
    );
  }
  const observation = await deps.source(source as Hex, p);
  if (!observation.finalized) throw new Error("Source finality pending");
  await hasLease();
  await db.query(
    "UPDATE payment_intents SET source_tx=$3,state=$4,source_confirmed_at=COALESCE(source_confirmed_at,now()),updated_at=now() WHERE id=$1 AND organization_id=$2 AND state<>'settled'",
    [
      payment.id,
      job.organization_id,
      source,
      observation.crossChain ? "destination_pending" : "source_confirmed",
    ],
  );
  let destination: string | null = null;
  if (observation.crossChain) {
    if (!deps.destination)
      throw new Error(
        "Destination receipt pending; source burn is not vendor receipt",
      );
    const result = await deps.destination({ ...payment, source_tx: source }, p);
    if (!result.finalized) throw new Error("Destination finality pending");
    destination = result.transaction;
  }
  await hasLease();
  const ledger = makeLedgerEvent({
    id: randomUUID(),
    tenantId: job.organization_id,
    paymentId: payment.id,
    invoiceId: payment.invoice_id,
    engagementId: payment.engagement_id,
    at: new Date().toISOString(),
    kind: "settlement",
    network: p.destinationChainId,
    transaction: destination ?? source,
    status: "settled",
    postings: [
      {
        account: "accounts_payable",
        asset: p.token,
        units: p.amount,
        side: "debit",
      },
      { account: "cash_usdc", asset: p.token, units: p.amount, side: "credit" },
    ],
  });
  // One SQL statement atomically records settlement, updates the intent and invoice,
  // and preserves the preceding invoice version. A retried job cannot double-post.
  await db.query(
    `WITH inserted AS (
 INSERT INTO ledger_events(id,organization_id,payment_id,external_key,body) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(organization_id,external_key) DO NOTHING RETURNING id
 ), settled AS (
 UPDATE payment_intents SET state='settled',destination_tx=$6,settled_at=COALESCE(settled_at,now()),updated_at=now()
 WHERE id=$3 AND organization_id=$2 AND state<>'settled' RETURNING invoice_id,amount
 ), previous AS (
 INSERT INTO record_versions(organization_id,kind,id,version,body,actor)
 SELECT r.organization_id,r.kind,r.id,r.version,r.body,'system:settlement' FROM records r JOIN settled s ON s.invoice_id=r.id
 WHERE r.organization_id=$2 AND r.kind='invoice' ON CONFLICT DO NOTHING RETURNING id
 ), totals AS (
 SELECT s.invoice_id,s.amount+COALESCE((SELECT SUM(p.amount) FROM payment_intents p WHERE p.organization_id=$2 AND p.invoice_id=s.invoice_id AND p.state='settled' AND p.id<>$3),0) AS paid FROM settled s
 ) UPDATE records r SET body=r.body || jsonb_build_object('paidAmount',t.paid::text,'status',CASE WHEN t.paid >= (r.body->>'amount')::numeric THEN 'paid' ELSE 'partially_paid' END),version=r.version+1,updated_at=now()
 FROM totals t WHERE r.organization_id=$2 AND r.kind='invoice' AND r.id=t.invoice_id`,
    [
      ledger.id,
      job.organization_id,
      payment.id,
      `settlement:${payment.id}`,
      JSON.stringify(ledger),
      destination,
    ],
  );
}
