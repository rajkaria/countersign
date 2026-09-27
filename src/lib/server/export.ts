import type { Database } from "./db";
import type { Actor } from "./auth";
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function accountingExport(db: Database, actor: Actor) {
  const rows = (
    await db.query<{
      id: string;
      invoice_id: string;
      engagement_id: string;
      amount: string;
      state: string;
      permit: Record<string, unknown>;
      source_tx: string | null;
      destination_tx: string | null;
      created_at: Date;
      settled_at: Date | null;
      invoice: Record<string, unknown>;
      vendor: Record<string, unknown>;
    }>(
      `SELECT p.id,p.invoice_id,p.engagement_id,p.amount,p.state,p.permit,p.source_tx,p.destination_tx,p.created_at,p.settled_at,i.body AS invoice,v.body AS vendor FROM payment_intents p JOIN records i ON i.organization_id=p.organization_id AND i.kind='invoice' AND i.id=p.invoice_id LEFT JOIN records v ON v.organization_id=p.organization_id AND v.kind='vendor' AND v.id=(i.body->>'vendorId')::uuid WHERE p.organization_id=$1 ORDER BY p.created_at,p.id`,
      [actor.organizationId],
    )
  ).rows;
  return rows.map((r) => ({
    payment_id: r.id,
    invoice_id: r.invoice_id,
    invoice_reference: r.invoice.reference,
    vendor_reference: r.vendor?.reference ?? "",
    vendor_name: r.vendor?.name ?? "",
    engagement_id: r.engagement_id,
    source_currency: r.invoice.currency,
    source_atomic_amount: r.invoice.amount,
    settlement_asset: "USDC",
    settlement_atomic_amount: r.amount,
    fee_atomic_units: r.state === "settled" ? "0" : "",
    source_chain_id:
      (r.permit.modulePermit as Record<string, unknown> | undefined)
        ?.sourceChainId ?? "",
    destination_chain_id: r.invoice.destinationChainId ?? "",
    recipient: r.invoice.destination,
    source_transaction: r.source_tx ?? "",
    destination_transaction: r.destination_tx ?? "",
    approval_reference: r.permit.decisionId ?? "",
    reconciliation_status: r.state,
    created_at: new Date(r.created_at).toISOString(),
    settled_at: r.settled_at ? new Date(r.settled_at).toISOString() : "",
  }));
}
