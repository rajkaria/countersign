import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { Database } from "./db";
import { ServiceError } from "./db";
import { type Actor, requireRole, digest } from "./auth";
import { audit, lockOrganization, getRecord } from "./records";
import { isReleased, type DeskPayment } from "./operations";

export type CapabilityKind = "vendor-links" | "intake-keys";
const tableFor = (kind: CapabilityKind) =>
  kind === "vendor-links" ? "vendor_links" : "intake_keys";
export async function issueVendorLink(
  db: Database,
  actor: Actor,
  caseId: string,
) {
  requireRole(actor, ["owner", "approver"]);
  await lockOrganization(db, actor);
  const record = await getRecord(db, actor, "case", z.uuid().parse(caseId));
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO vendor_links(token_hash,organization_id,vendor_id,case_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
    [digest(token), actor.organizationId, record.body.vendorId, record.id],
  );
  await audit(db, actor, "vendor_link.created", record.id);
  return { path: `/vendor#${token}`, expiresInDays: 7 };
}
export async function issueIntakeKey(
  db: Database,
  actor: Actor,
  label: string,
) {
  requireRole(actor, ["owner"]);
  const name = z.string().trim().min(1).max(120).parse(label);
  await lockOrganization(db, actor);
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO intake_keys(token_hash,organization_id,label,created_by) VALUES($1,$2,$3,$4)",
    [digest(token), actor.organizationId, name, actor.wallet],
  );
  await audit(db, actor, "intake_key.created", actor.organizationId, {
    label: name,
  });
  return {
    token,
    endpoint: "/api/intake",
    warning:
      "Store this token securely. It is shown only once and cannot approve or pay invoices.",
  };
}
export async function updateMember(
  db: Database,
  actor: Actor,
  wallet: string,
  role: "approver" | "operator" | "viewer",
) {
  requireRole(actor, ["owner"]);
  const target = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .parse(wallet)
    .toLowerCase();
  const nextRole = z.enum(["approver", "operator", "viewer"]).parse(role);
  await lockOrganization(db, actor);
  const member = (
    await db.query<{ role: string }>(
      "SELECT role FROM members WHERE organization_id=$1 AND wallet=$2",
      [actor.organizationId, target],
    )
  ).rows[0];
  if (target === actor.wallet || member?.role === "owner")
    throw new ServiceError(
      409,
      "OWNER_ROLE",
      "Owner changes require a separate reviewed ownership transfer.",
    );
  await db.query(
    "INSERT INTO members(organization_id,wallet,role) VALUES($1,$2,$3) ON CONFLICT(organization_id,wallet) DO UPDATE SET role=EXCLUDED.role",
    [actor.organizationId, target, nextRole],
  );
  await audit(db, actor, "member.updated", target, { role: nextRole });
  return { saved: true };
}
export async function listCapabilities(
  db: Database,
  actor: Actor,
  kind: CapabilityKind,
) {
  requireRole(
    actor,
    kind === "vendor-links" ? ["owner", "approver"] : ["owner"],
  );
  const columns =
    kind === "vendor-links"
      ? "id,vendor_id,case_id,expires_at,revoked_at,created_at"
      : "id,label,created_by,revoked_at,created_at";
  return (
    await db.query(
      `SELECT ${columns} FROM ${tableFor(kind)} WHERE organization_id=$1 ORDER BY created_at DESC,id`,
      [actor.organizationId],
    )
  ).rows;
}
/** Revocation is scoped to a public identifier; raw tokens and token hashes are never returned. */
export async function revokeCapability(
  db: Database,
  actor: Actor,
  kind: CapabilityKind,
  capabilityId: string,
) {
  requireRole(
    actor,
    kind === "vendor-links" ? ["owner", "approver"] : ["owner"],
  );
  const target = z.uuid().parse(capabilityId);
  await lockOrganization(db, actor);
  const row = (
    await db.query(
      `UPDATE ${tableFor(kind)} SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1 AND id=$2 RETURNING id,revoked_at`,
      [actor.organizationId, target],
    )
  ).rows[0];
  if (!row)
    throw new ServiceError(
      404,
      "ACCESS_NOT_FOUND",
      "Access link not found in this workspace.",
    );
  await audit(db, actor, `${kind}.revoked`, target);
  return row;
}
export async function removeMember(db: Database, actor: Actor, wallet: string) {
  requireRole(actor, ["owner"]);
  const target = z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .parse(wallet)
    .toLowerCase();
  await lockOrganization(db, actor);
  const member = (
    await db.query<{ role: string }>(
      "SELECT role FROM members WHERE organization_id=$1 AND wallet=$2",
      [actor.organizationId, target],
    )
  ).rows[0];
  if (!member)
    throw new ServiceError(
      404,
      "MEMBER_NOT_FOUND",
      "Member not found in this workspace.",
    );
  if (member.role === "owner")
    throw new ServiceError(
      409,
      "OWNER_ROLE",
      "Owner changes require a separate reviewed ownership transfer.",
    );
  await db.query("DELETE FROM members WHERE organization_id=$1 AND wallet=$2", [
    actor.organizationId,
    target,
  ]);
  await audit(db, actor, "member.removed", target);
  return {
    removed: true,
    notice:
      "Workspace access was removed. Signed on-chain permits require independent revocation or expiry.",
  };
}
export async function paymentDetails(
  db: Database,
  actor: Actor,
  paymentId: string,
) {
  const row = (
    await db.query<{
      id: string;
      permit: Record<string, unknown>;
      [key: string]: unknown;
    }>(
      "SELECT id,invoice_id,engagement_id,amount,state,permit,provider_id,source_tx,destination_tx,source_confirmed_at,settled_at,invalidated_at,invalidation_reason,created_at,updated_at FROM payment_intents WHERE organization_id=$1 AND id=$2",
      [actor.organizationId, z.uuid().parse(paymentId)],
    )
  ).rows[0];
  if (!row)
    throw new ServiceError(
      404,
      "PAYMENT_NOT_FOUND",
      "Payment not found in this workspace.",
    );
  const { verifierSignature: _signature, ...permit } = row.permit;
  void _signature;
  return {
    ...row,
    permit,
    notice:
      "Submitted and source-confirmed states do not establish destination receipt. Records do not grant signing authority.",
  };
}
export async function invoiceBalance(
  db: Database,
  actor: Actor,
  invoiceId: string,
) {
  const invoice = await getRecord(
    db,
    actor,
    "invoice",
    z.uuid().parse(invoiceId),
  );
  const payments = (
    await db.query<DeskPayment>(
      "SELECT * FROM payment_intents WHERE organization_id=$1 AND (invoice_id=$2 OR (engagement_id=$3 AND permit->>'obligationId'=$4))",
      [
        actor.organizationId,
        invoice.id,
        invoice.body.engagementId,
        invoice.body.obligationId ?? "unbound",
      ],
    )
  ).rows.filter((p) => !isReleased(p));
  const settledUSDC = payments
    .filter((p) => p.state === "settled")
    .reduce((n, p) => n + BigInt(p.amount), 0n);
  const reservedUSDC = payments
    .filter((p) => p.state !== "settled")
    .reduce((n, p) => n + BigInt(p.amount), 0n);
  const invoiced = BigInt(String(invoice.body.amount));
  const comparable = invoice.body.currency === "USDC";
  const settled = comparable ? settledUSDC : 0n;
  const reserved = comparable ? reservedUSDC : 0n;
  return {
    invoiced: invoiced.toString(),
    settled: settled.toString(),
    reserved: reserved.toString(),
    remaining: (invoiced > settled + reserved
      ? invoiced - settled - reserved
      : 0n
    ).toString(),
    currency: invoice.body.currency,
    invoiceVersion: invoice.version,
    overallocated: settled + reserved > invoiced,
    comparable,
    settlementAsset: "USDC" as const,
    settlementAllocations: {
      settled: settledUSDC.toString(),
      reserved: reservedUSDC.toString(),
    },
    warnings: comparable
      ? []
      : [
          "Currency conversion is unconfigured. USDC settlement and reservations cannot discharge this invoice denomination.",
        ],
  };
}
