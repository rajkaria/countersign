import { atomic, timestamp } from "./money";
export type Posting = Readonly<{
  account: string;
  asset: string;
  units: string;
  side: "debit" | "credit";
}>;
export type LedgerEvent = Readonly<{
  id: string;
  tenantId: string;
  paymentId: string;
  at: string;
  kind:
    | "recognition"
    | "reservation"
    | "in_transit"
    | "settlement"
    | "fee"
    | "credit"
    | "refund"
    | "reversal"
    | "adjustment";
  postings: readonly Posting[];
  reversalOf?: string;
  invoiceId?: string;
  vendorReference?: string;
  engagementId?: string;
  category?: string;
  sourceCurrency?: string;
  sourceAmount?: string;
  network?: string;
  transaction?: string;
  approvalReference?: string;
  status?: string;
  fxQuote?: string;
}>;
export function makeLedgerEvent(event: LedgerEvent): LedgerEvent {
  timestamp(event.at);
  if (
    !event.id ||
    !event.tenantId ||
    !event.paymentId ||
    event.postings.length < 2
  )
    throw new Error("Ledger identity and balanced postings required");
  const totals = new Map<string, bigint>();
  for (const p of event.postings) {
    if (!p.account || !p.asset || !["debit", "credit"].includes(p.side))
      throw new Error("Invalid posting");
    const n = atomic(p.units);
    totals.set(
      p.asset,
      (totals.get(p.asset) ?? 0n) + (p.side === "debit" ? n : -n),
    );
  }
  if ([...totals.values()].some((n) => n !== 0n))
    throw new Error("Unbalanced ledger event per asset");
  return Object.freeze({
    ...event,
    postings: Object.freeze(event.postings.map((p) => Object.freeze({ ...p }))),
  });
}
export function reverseLedgerEvent(
  event: LedgerEvent,
  id: string,
  at: string,
): LedgerEvent {
  if (event.id === id || timestamp(at) < timestamp(event.at))
    throw new Error("Reversal must have a new identity and later timestamp");
  return makeLedgerEvent({
    ...event,
    id,
    at,
    kind: "reversal",
    reversalOf: event.id,
    postings: event.postings.map((p) => ({
      ...p,
      side: p.side === "debit" ? "credit" : "debit",
    })),
  });
}
function csv(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function exportLedger(events: readonly LedgerEvent[]) {
  const unique = new Map<string, LedgerEvent>();
  let tenant: string | undefined;
  for (const e of events) {
    makeLedgerEvent(e);
    if (tenant && e.tenantId !== tenant)
      throw new Error("Cannot export multiple tenants");
    tenant = e.tenantId;
    const existing = unique.get(e.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(e))
      throw new Error("Conflicting duplicate ledger identity");
    unique.set(e.id, e);
  }
  const ordered = [...unique.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
  const headers = [
    "event_id",
    "payment_id",
    "invoice_id",
    "vendor",
    "engagement",
    "timestamp",
    "kind",
    "account",
    "asset",
    "atomic_units",
    "side",
    "source_currency",
    "source_amount",
    "network",
    "transaction",
    "approval",
    "status",
    "reversal_of",
    "category",
    "fx_quote",
  ];
  const rows = ordered.flatMap((e) =>
    e.postings.map((p) => [
      e.id,
      e.paymentId,
      e.invoiceId ?? "",
      e.vendorReference ?? "",
      e.engagementId ?? "",
      e.at,
      e.kind,
      p.account,
      p.asset,
      p.units,
      p.side,
      e.sourceCurrency ?? "",
      e.sourceAmount ?? "",
      e.network ?? "",
      e.transaction ?? "",
      e.approvalReference ?? "",
      e.status ?? "",
      e.reversalOf ?? "",
      e.category ?? "",
      e.fxQuote ?? "",
    ]),
  );
  return {
    count: ordered.length,
    json: JSON.stringify({ schemaVersion: 1, events: ordered }, null, 2),
    csv:
      [headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n") +
      "\r\n",
    eventIds: ordered.map((e) => e.id),
  };
}
