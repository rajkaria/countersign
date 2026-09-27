import { z } from "zod";
import { type Database, id, ServiceError } from "./db";
import { type Actor, requireRole, digest } from "./auth";
import { lockOrganization, getRecord, audit } from "./records";
const schema = z
  .object({
    invoiceId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    action: z.enum(["hold", "clear_hold"]),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
/** Run in one transaction. Overrides can narrow authority; they never bypass verification or force payment. */
export async function overrideInvoice(
  db: Database,
  actor: Actor,
  input: unknown,
  sessionToken: string,
) {
  requireRole(actor, ["owner"]);
  const request = schema.parse(input);
  await lockOrganization(db, actor);
  const invoice = await getRecord(
    db,
    actor,
    "invoice",
    request.invoiceId,
    true,
  );
  if (invoice.version !== request.expectedVersion)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "Invoice changed. Refresh before overriding.",
    );
  if (
    ["paid", "partially_paid", "canceled"].includes(String(invoice.body.status))
  )
    throw new ServiceError(
      409,
      "COMMITTED_INVOICE",
      "Reconcile committed invoices using a separately reviewed adjustment.",
    );
  if (request.action === "clear_hold") {
    if (!invoice.body.manualHold)
      throw new ServiceError(
        409,
        "NO_MANUAL_HOLD",
        "There is no manual hold to clear.",
      );
    const session = (
      await db.query(
        "SELECT token_hash FROM sessions WHERE token_hash=$1 AND wallet=$2 AND expires_at>now() AND created_at>now()-interval '5 minutes'",
        [digest(sessionToken), actor.wallet],
      )
    ).rows[0];
    if (!session)
      throw new ServiceError(
        401,
        "REAUTHENTICATION",
        "Sign in again before clearing a manual hold.",
      );
  }
  const active = (
    await db.query(
      "SELECT id FROM payment_intents WHERE organization_id=$1 AND invoice_id=$2 AND (provider_id IS NOT NULL OR source_tx IS NOT NULL OR state IN ('submitted','uncertain','source_confirmed','destination_pending','recovery_required'))",
      [actor.organizationId, invoice.id],
    )
  ).rows;
  if (request.action === "clear_hold" && active.length)
    throw new ServiceError(
      409,
      "RECONCILE_FIRST",
      "Reconcile the existing operation before clearing this hold.",
    );
  const overrideId = id(),
    version = invoice.version + 1;
  const coverageConsequence =
    "This override does not add or extend coverage. Existing allocation rights remain governed by their exact terms; future payment requires a newly verified decision and allocation.";
  const body = {
    ...invoice.body,
    status: request.action === "hold" ? "disputed" : "received",
    manualHold: request.action === "hold",
    lastOverrideId: overrideId,
  };
  await db.query(
    "UPDATE records SET body=$3,version=$4,updated_at=now() WHERE organization_id=$1 AND kind='invoice' AND id=$2",
    [actor.organizationId, invoice.id, JSON.stringify(body), version],
  );
  await db.query(
    "INSERT INTO record_versions(organization_id,kind,id,version,body,actor) VALUES($1,'invoice',$2,$3,$4,$5)",
    [
      actor.organizationId,
      invoice.id,
      version,
      JSON.stringify(body),
      actor.wallet,
    ],
  );
  const result = {
    id: overrideId,
    ...request,
    invoiceVersion: version,
    actor: actor.wallet,
    coverageConsequence,
    inFlight: active.length > 0,
    notice: active.length
      ? "Submission may already have occurred. An application hold cannot revoke a broadcast transaction. Use independent Safe recovery and reconcile the same operation."
      : "All future release requires fresh verification; no policy or destination was changed.",
  };
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'human_override',$2,$3,$4)",
    [actor.organizationId, overrideId, JSON.stringify(result), actor.wallet],
  );
  await db.query(
    "UPDATE payment_intents SET invalidated_at=now(),invalidation_reason=$3,updated_at=now() WHERE organization_id=$1 AND invoice_id=$2 AND state IN ('prepared','capacity_reserved','authorized') AND provider_id IS NULL AND source_tx IS NULL",
    [actor.organizationId, invoice.id, `Scoped owner override ${overrideId}`],
  );
  await audit(db, actor, `invoice.${request.action}`, invoice.id, result);
  await db.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'reassess',$3,$4) ON CONFLICT DO NOTHING",
    [
      id(),
      actor.organizationId,
      JSON.stringify({ kind: "invoice", id: invoice.id, version }),
      `${actor.organizationId}:override:${overrideId}`,
    ],
  );
  return result;
}
