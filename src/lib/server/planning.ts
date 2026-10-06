import { planCommitments, atomic } from "../domain";
import { type Actor, requireRole } from "./auth";
import { type Database, id, ServiceError } from "./db";
import { getRecord, listRecords, audit, lockOrganization } from "./records";
import { evaluateInvoice } from "./review";
type PendingPayment = {
  invoice_id: string;
  amount: string;
  state: string;
  permit: Record<string, unknown>;
  source_tx: string | null;
  destination_tx: string | null;
  source_confirmed_at: string | null;
  terminal_failure_proof: string | null;
};
const released = (p: PendingPayment) =>
  p.state === "failed" &&
  Boolean(p.terminal_failure_proof?.trim()) &&
  !p.source_tx &&
  !p.destination_tx;
/** The caller runs this in a transaction. Confirmed observations, not forecast fields, provide cash. */
export async function buildCashPlan(
  db: Database,
  actor: Actor,
  policyId: string,
) {
  requireRole(actor, ["owner", "approver", "operator"]);
  await lockOrganization(db, actor);
  const policy = await getRecord(db, actor, "policy", policyId);
  const safe = await getRecord(db, actor, "safe", String(policy.body.safeId));
  const observation = (
    await db.query<{ id: string; body: Record<string, unknown> }>(
      "SELECT id,body FROM records WHERE organization_id=$1 AND kind='chain_observation' AND body->>'safeId'=$2 ORDER BY created_at DESC LIMIT 1",
      [actor.organizationId, safe.id],
    )
  ).rows[0];
  const observationTime = Date.parse(String(observation?.body.observedAt));
  if (
    !observation ||
    !Number.isFinite(observationTime) ||
    observationTime > Date.now() ||
    Date.now() - observationTime > 300000
  )
    throw new ServiceError(
      409,
      "STALE_BALANCE",
      "Sync the Safe before planning against its confirmed balance.",
    );
  const policies = await listRecords(db, actor, "policy");
  const safePolicies = policies.filter((p) => p.body.safeId === safe.id);
  const policyIds = new Set(safePolicies.map((p) => p.id));
  const policiesById = new Map(policies.map((p) => [p.id, p]));
  const payments = (
    await db.query<PendingPayment>(
      "SELECT invoice_id,amount,state,permit,source_tx,destination_tx,source_confirmed_at,terminal_failure_proof FROM payment_intents WHERE organization_id=$1 AND state<>'settled'",
      [actor.organizationId],
    )
  ).rows.filter(
    (p) =>
      !released(p) &&
      (!p.permit.policyId ||
        !policiesById.has(String(p.permit.policyId)) ||
        policyIds.has(String(p.permit.policyId))),
  );
  // A confirmed source debit already included by this balance is not deducted twice.
  const pending = payments
    .filter(
      (p) =>
        !p.source_confirmed_at ||
        Date.parse(p.source_confirmed_at) > observationTime,
    )
    .reduce((sum, p) => sum + atomic(p.amount), 0n);
  let protectedReserve = 0n,
    operatingReserve = 0n;
  for (const p of safePolicies) {
    protectedReserve += atomic(String(p.body.protectedAmount));
    const floor =
      atomic(String(p.body.cashFloor)) + atomic(String(p.body.feeReserve));
    if (floor > operatingReserve) operatingReserve = floor;
  }
  const engagements = await listRecords(db, actor, "engagement");
  const invoices = (await listRecords(db, actor, "invoice")).filter(
    (i) =>
      !["paid", "canceled"].includes(String(i.body.status)) &&
      !payments.some((p) => p.invoice_id === i.id) &&
      engagements.some(
        (e) =>
          e.id === i.body.engagementId &&
          (!e.body.policyId || e.body.policyId === policyId),
      ),
  );
  const items = [];
  for (const invoice of invoices) {
    const { decision, balance } = await evaluateInvoice(db, actor, invoice.id);
    items.push({
      id: invoice.id,
      amount: balance.remaining,
      fee: "0",
      dueAt: `${invoice.body.dueDate}T23:59:59Z`,
      priority: 1,
      eligible: decision.action === "PAY",
      allowEarly: false,
    });
  }
  const plan = planCommitments({
    confirmedCash: String(observation.body.balance),
    operatingReserve: operatingReserve.toString(),
    protectedReserve: protectedReserve.toString(),
    pendingReserve: pending.toString(),
    expectedInflows: "0",
    now: new Date().toISOString(),
    items,
  });
  const planId = id();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'payment_plan',$2,$3,$4)",
    [
      actor.organizationId,
      planId,
      JSON.stringify({
        ...plan,
        policyId,
        policyVersion: policy.version,
        observationId: observation.id,
      }),
      actor.wallet,
    ],
  );
  await audit(db, actor, "plan.created", planId, { policyId });
  return { id: planId, ...plan };
}
