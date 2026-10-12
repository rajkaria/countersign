import { z } from "zod";
import type { Database } from "./db";
import { id, ServiceError } from "./db";
import { type Actor, requireRole } from "./auth";
import { audit, getRecord, lockOrganization, saveRecord } from "./records";
import { accountingExport, csvCell } from "./export";
import { formatObligationAmount } from "../domain/money";
import { consoleReviewHref, type ConsoleReview } from "../console-review";

export type DeskRecord = {
  id: string;
  kind: string;
  version: number;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
export type DeskPayment = {
  id: string;
  invoice_id: string;
  engagement_id: string;
  amount: string;
  state: string;
  permit: Record<string, unknown>;
  source_tx?: string | null;
  destination_tx?: string | null;
  terminal_failure_proof?: string | null;
  created_at?: string;
  settled_at?: string | null;
  updated_at?: string;
};
const units = (value: unknown) =>
  BigInt(
    z
      .string()
      .regex(/^(0|[1-9][0-9]{0,77})$/)
      .parse(String(value)),
  );
const minus = (a: bigint, b: bigint) => (a > b ? a - b : 0n);
export const isReleased = (p: DeskPayment) =>
  p.state === "failed" &&
  Boolean(p.terminal_failure_proof?.trim()) &&
  !p.source_tx &&
  !p.destination_tx;
const obligation = (r: DeskRecord) =>
  `${r.body.engagementId}:${r.body.obligationId ?? `${r.body.periodStart}:${r.body.periodEnd}`}`;
const daySchema = z.iso.date();
const priorities = ["urgent", "high", "normal", "low"];
const reminderText = (value: unknown, maximum = 100) => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
};

/** An operational view, never a payment authorization. Totals deduplicate exact obligation identities. */
export function summarizePayables(
  records: DeskRecord[],
  payments: DeskPayment[],
  now = new Date().toISOString(),
) {
  if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid desk time");
  const today = now.slice(0, 10);
  const totals: Record<
    string,
    {
      invoiced: string;
      settled: string;
      committed: string;
      outstanding: string;
      unallocated: string;
      overdue: string;
      dueSoon: string;
    }
  > = {};
  const groups = new Map<string, DeskRecord[]>();
  const obligationCurrencies = new Map<string, Set<string>>();
  const matchedPayments = new Set<string>();
  for (const invoice of records.filter(
    (r) => r.kind === "invoice" && r.body.status !== "canceled",
  )) {
    units(invoice.body.amount);
    const baseKey = obligation(invoice);
    const currency = String(invoice.body.currency ?? "USDC");
    obligationCurrencies.set(
      baseKey,
      new Set([...(obligationCurrencies.get(baseKey) ?? []), currency]),
    );
    const key = `${baseKey}:${currency}`;
    groups.set(key, [...(groups.get(key) ?? []), invoice]);
  }
  let duplicateObligations = 0;
  const invoices = [...groups.values()]
    .flatMap((group) => {
      duplicateObligations += group.length > 1 ? 1 : 0;
      const currency = String(group[0].body.currency ?? "USDC");
      const sameCurrency = group.every(
        (r) => String(r.body.currency ?? "USDC") === currency,
      );
      const amount = group.reduce(
        (max, r) => (units(r.body.amount) > max ? units(r.body.amount) : max),
        0n,
      );
      const relevant = payments.filter(
        (p) =>
          group.some((r) => p.invoice_id === r.id) ||
          (p.engagement_id === String(group[0].body.engagementId) &&
            p.permit.obligationId !== undefined &&
            p.permit.obligationId === group[0].body.obligationId),
      );
      relevant.forEach((p) => matchedPayments.add(p.id));
      const settledUnits = relevant
        .filter((p) => p.state === "settled")
        .reduce((n, p) => n + units(p.amount), 0n);
      const committedUnits = relevant
        .filter((p) => p.state !== "settled" && !isReleased(p))
        .reduce((n, p) => n + units(p.amount), 0n);
      // Current execution supports USDC only. A USD invoice requires separately approved conversion accounting.
      const comparable = currency === "USDC" && sameCurrency;
      const settled = comparable ? settledUnits : 0n,
        committed = comparable ? committedUnits : 0n;
      const outstanding = minus(amount, settled),
        unallocated = minus(outstanding, committed);
      const dueDate = group.map((r) => String(r.body.dueDate)).sort()[0];
      const days = Math.floor(
        (Date.parse(`${dueDate}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86400000,
      );
      const warnings = [
        ...(group.length > 1
          ? [
              "Multiple invoices share this obligation. Totals use its largest submitted amount once; review the duplicates.",
            ]
          : []),
        ...(!comparable
          ? [
              "Currency conversion is unconfigured. USDC transfers cannot discharge this obligation in this view.",
            ]
          : []),
        ...((obligationCurrencies.get(obligation(group[0]))?.size ?? 0) > 1
          ? [
              "Conflicting invoice currencies share an obligation identity. Reconcile the denomination before payment.",
            ]
          : []),
        ...(settled > amount
          ? [
              "Settled allocations exceed submitted obligation amount; reconcile the overpayment.",
            ]
          : []),
        ...(settled + committed > amount
          ? [
              "Allocations exceed the submitted amount; hold and reconcile before another payment.",
            ]
          : []),
        ...(relevant.some(
          (p) =>
            ["uncertain", "recovery_required", "failed"].includes(p.state) &&
            !isReleased(p),
        )
          ? [
              "Unresolved network effects retain their original identity and commitment.",
            ]
          : []),
      ];
      const current = totals[currency] ?? {
        invoiced: "0",
        settled: "0",
        committed: "0",
        outstanding: "0",
        unallocated: "0",
        overdue: "0",
        dueSoon: "0",
      };
      const additions = {
        invoiced: amount,
        settled,
        committed,
        outstanding,
        unallocated,
        overdue: days < 0 ? outstanding : 0n,
        dueSoon: days >= 0 && days <= 7 ? outstanding : 0n,
      };
      for (const k of Object.keys(current) as Array<keyof typeof current>)
        current[k] = (units(current[k]) + additions[k]).toString();
      totals[currency] = current;
      return group.map((r) => ({
        id: r.id,
        version: r.version,
        reference: String(r.body.reference),
        vendorId: String(r.body.vendorId ?? ""),
        engagementId: String(r.body.engagementId),
        currency,
        amount: String(r.body.amount),
        settled: settled.toString(),
        committed: committed.toString(),
        outstanding: outstanding.toString(),
        unallocated: unallocated.toString(),
        dueDate: String(r.body.dueDate),
        daysUntilDue: Math.floor(
          (Date.parse(`${r.body.dueDate}T00:00:00Z`) -
            Date.parse(`${today}T00:00:00Z`)) /
            86400000,
        ),
        status: String(r.body.status),
        paymentIds: relevant.map((p) => p.id),
        duplicate: group.length > 1,
        warnings,
      }));
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.reference.localeCompare(b.reference),
    );
  const unattributedCommittedUSDC = payments
    .filter(
      (p) =>
        !matchedPayments.has(p.id) && p.state !== "settled" && !isReleased(p),
    )
    .reduce((n, p) => n + units(p.amount), 0n)
    .toString();
  return {
    totals,
    duplicateObligations,
    invoices,
    unattributedCommittedUSDC,
    asOf: now,
    limitation:
      "Exact obligation identities are deduplicated; overlapping or semantically similar obligations need evidence review. Confirmed cash and spendability require a fresh Safe observation and verifier.",
  };
}

export const preferencesSchema = z
  .object({
    notificationsEnabled: z.boolean().default(false),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone"),
    quietHoursEnabled: z.boolean(),
    quietStart: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
    quietEnd: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
    reminderDays: z.number().int().min(0).max(30),
    escalationHours: z.number().int().min(1).max(720),
  })
  .strict();
export type OperationsPreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: OperationsPreferences = {
  notificationsEnabled: false,
  timezone: "UTC",
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  reminderDays: 3,
  escalationHours: 48,
};
export function digestWindow(
  raw: OperationsPreferences,
  now = new Date().toISOString(),
) {
  const prefs = preferencesSchema.parse(raw);
  if (!prefs.notificationsEnabled)
    return { allowed: false, reason: "Workspace notifications are disabled." };
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: prefs.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const quiet =
    prefs.quietHoursEnabled &&
    (prefs.quietStart < prefs.quietEnd
      ? clock >= prefs.quietStart && clock < prefs.quietEnd
      : prefs.quietStart > prefs.quietEnd
        ? clock >= prefs.quietStart || clock < prefs.quietEnd
        : true);
  return {
    allowed: !quiet,
    reason: quiet
      ? "Workspace quiet hours are active."
      : "Outside quiet hours; delivery still requires explicitly configured worker credentials.",
  };
}
export async function readOperationsPreferences(
  db: Database,
  organizationId: string,
) {
  const row = (
    await db.query<{ version: number; body: unknown }>(
      "SELECT version,body FROM records WHERE organization_id=$1 AND kind='operations_preferences' AND id=$1",
      [organizationId],
    )
  ).rows[0];
  return {
    version: row?.version ?? 0,
    preferences: row ? preferencesSchema.parse(row.body) : defaultPreferences,
  };
}
/** Caller owns a transaction; organization lock serializes first-write and optimistic updates. */
export async function saveOperationsPreferences(
  db: Database,
  actor: Actor,
  raw: unknown,
) {
  requireRole(actor, ["owner"]);
  const input = z
    .object({
      expectedVersion: z.number().int().nonnegative(),
      preferences: preferencesSchema,
    })
    .strict()
    .parse(raw);
  await lockOrganization(db, actor);
  const current = await readOperationsPreferences(db, actor.organizationId);
  if (current.version !== input.expectedVersion)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "Preferences changed. Refresh before saving.",
    );
  const version = current.version + 1;
  await db.query(
    "INSERT INTO records(organization_id,kind,id,version,body,created_by) VALUES($1,'operations_preferences',$1,$2,$3,$4) ON CONFLICT(organization_id,kind,id) DO UPDATE SET version=EXCLUDED.version,body=EXCLUDED.body,updated_at=now()",
    [
      actor.organizationId,
      version,
      JSON.stringify(input.preferences),
      actor.wallet,
    ],
  );
  await db.query(
    "INSERT INTO record_versions(organization_id,kind,id,version,body,actor) VALUES($1,'operations_preferences',$1,$2,$3,$4)",
    [
      actor.organizationId,
      version,
      JSON.stringify(input.preferences),
      actor.wallet,
    ],
  );
  await audit(db, actor, "operations.preferences_saved", actor.organizationId, {
    version,
    notificationsEnabled: input.preferences.notificationsEnabled,
  });
  return { version, preferences: input.preferences };
}
export async function updateOperationsCase(
  db: Database,
  actor: Actor,
  caseId: string,
  raw: unknown,
) {
  requireRole(actor, ["owner", "approver", "operator"]);
  const input = z
    .object({
      expectedVersion: z.number().int().positive(),
      owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      status: z.enum([
        "open",
        "awaiting_evidence",
        "awaiting_approval",
        "resolved",
      ]),
      priority: z.enum(["low", "normal", "high", "urgent"]),
      dueAt: z.iso.datetime().optional(),
      resolution: z.string().trim().max(2000).default(""),
    })
    .strict()
    .parse(raw);
  if (input.status === "resolved" && input.resolution.length < 12)
    throw new ServiceError(
      400,
      "RESOLUTION_REQUIRED",
      "Describe the evidence and resolution in at least 12 characters.",
    );
  await lockOrganization(db, actor);
  if (
    !(
      await db.query(
        "SELECT wallet FROM members WHERE organization_id=$1 AND wallet=$2 AND role IN ('owner','approver','operator')",
        [actor.organizationId, input.owner.toLowerCase()],
      )
    ).rows.length
  )
    throw new ServiceError(
      400,
      "CASE_ASSIGNEE",
      "Assign the case to a current owner, approver or operator member.",
    );
  const existing = await getRecord(
    db,
    actor,
    "case",
    z.uuid().parse(caseId),
    true,
  );
  await getRecord(db, actor, "invoice", String(existing.body.invoiceId));
  if (existing.version !== input.expectedVersion)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "This case changed. Refresh before saving.",
    );
  const record = await saveRecord(
    db,
    actor,
    "case",
    {
      ...existing.body,
      owner: input.owner.toLowerCase(),
      status: input.status,
      priority: input.priority,
      dueAt: input.dueAt,
      resolution: input.resolution,
    },
    caseId,
    input.expectedVersion,
  );
  await db.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'reassess',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",
    [
      id(),
      actor.organizationId,
      JSON.stringify({
        invoiceId: existing.body.invoiceId,
        caseId,
        caseVersion: record.version,
      }),
      `operations:case:${actor.organizationId}:${caseId}:${record.version}`,
    ],
  );
  await audit(db, actor, "operations.case_updated", caseId, {
    from: existing.body.status,
    status: input.status,
    owner: input.owner.toLowerCase(),
    priority: input.priority,
  });
  return {
    ...record,
    notice:
      "Case changes request reassessment. They cannot approve delivery, clear an invoice hold or authorize payment.",
  };
}
export async function operationsDesk(
  db: Database,
  actor: Actor,
  now = new Date().toISOString(),
) {
  const [records, payments, members, preferences, deliveries] =
    await Promise.all([
      db.query<DeskRecord>(
        "SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind IN ('invoice','case','vendor','engagement','automation_outcome') ORDER BY created_at DESC",
        [actor.organizationId],
      ),
      db.query<DeskPayment>(
        "SELECT * FROM payment_intents WHERE organization_id=$1 ORDER BY created_at DESC",
        [actor.organizationId],
      ),
      db.query<{ wallet: string; role: string }>(
        "SELECT wallet,role FROM members WHERE organization_id=$1 ORDER BY role,wallet",
        [actor.organizationId],
      ),
      readOperationsPreferences(db, actor.organizationId),
      db.query<{ event_id: string; state: string; updated_at: string }>(
        "SELECT event_id,state,updated_at FROM notification_deliveries WHERE organization_id=$1 ORDER BY updated_at DESC LIMIT 50",
        [actor.organizationId],
      ),
    ]);
  const summary = summarizePayables(records.rows, payments.rows, now);
  const cases = records.rows
    .filter((r) => r.kind === "case")
    .map((r) => ({
      ...r,
      escalated:
        !["resolved", "reevaluated"].includes(String(r.body.status)) &&
        (r.body.dueAt
          ? Date.parse(String(r.body.dueAt)) < Date.parse(now)
          : Date.parse(now) - Date.parse(r.created_at) >
            preferences.preferences.escalationHours * 3600000),
    }))
    .sort(
      (a, b) =>
        Number(b.escalated) - Number(a.escalated) ||
        priorities.indexOf(String(a.body.priority ?? "normal")) -
          priorities.indexOf(String(b.body.priority ?? "normal")),
    );
  const notices = [
    ...payments.rows
      .filter((p) =>
        ["uncertain", "recovery_required", "destination_pending"].includes(
          p.state,
        ),
      )
      .map((p) => {
        const review: ConsoleReview = {
          view: "history",
          invoiceId: p.invoice_id,
          paymentId: p.id,
        };
        const invoice = summary.invoices.find((r) => r.id === p.invoice_id);
        return {
          kind: "stuck_payment",
          id: p.id,
          message: `${reminderText(invoice?.reference ?? "Payment")}: ${formatObligationAmount(p.amount, "USDC")} ${p.state.replaceAll("_", " ")}. Reconcile the same operation ${p.id}.`,
          actionLabel: "Reconcile original payment",
          review,
          href: consoleReviewHref(actor.organizationId, review),
        };
      }),
    ...cases
      .filter(
        (r) => !["resolved", "reevaluated"].includes(String(r.body.status)),
      )
      .map((r) => {
        const invoice = summary.invoices.find((i) => i.id === r.body.invoiceId);
        const review: ConsoleReview = {
          view: "invoices",
          invoiceId: String(r.body.invoiceId),
          caseId: r.id,
        };
        return {
          kind: r.escalated ? "escalation" : "exception",
          id: r.id,
          message: `${reminderText(invoice?.reference ?? "Invoice")} — ${reminderText(r.body.title)}. Owner: ${r.body.owner || "Unassigned"}.${r.body.dueAt ? ` Resolve by ${r.body.dueAt}.` : " No case deadline set."} ${reminderText(r.body.reason, 240)}`,
          actionLabel: "Review exception and evidence",
          review,
          href: consoleReviewHref(actor.organizationId, review),
        };
      }),
    ...summary.invoices
      .filter(
        (r) =>
          BigInt(r.outstanding) > 0n &&
          r.daysUntilDue <= preferences.preferences.reminderDays,
      )
      .map((r) => {
        const owners = [
          ...new Set(
            cases
              .filter(
                (c) =>
                  c.body.invoiceId === r.id &&
                  !["resolved", "reevaluated"].includes(String(c.body.status)),
              )
              .map((c) => String(c.body.owner || "Unassigned")),
          ),
        ];
        const review: ConsoleReview = { view: "invoices", invoiceId: r.id };
        return {
          kind: r.daysUntilDue < 0 ? "overdue" : "due_soon",
          id: r.id,
          message: `${reminderText(r.reference)}: ${formatObligationAmount(r.outstanding, r.currency)} outstanding; due ${r.dueDate}${r.daysUntilDue < 0 ? ` (${Math.abs(r.daysUntilDue)} days overdue)` : r.daysUntilDue === 0 ? " (today)" : ""}.${owners.length ? ` Case owner: ${owners.slice(0, 3).join(", ")}${owners.length > 3 ? ` and ${owners.length - 3} more` : ""}.` : " No open case owner assigned."}`,
          actionLabel: "Review invoice and evidence",
          review,
          href: consoleReviewHref(actor.organizationId, review),
        };
      }),
  ];
  return {
    summary: { ...summary, invoices: undefined },
    invoices: summary.invoices,
    cases,
    members: members.rows,
    preferences,
    deliveries: deliveries.rows,
    digest: {
      ...digestWindow(preferences.preferences, now),
      previewOnly: true,
      sent: false,
      notices,
      note: "This preview sends nothing. Worker delivery requires workspace opt-in and an explicitly configured destination.",
    },
  };
}

export async function accountingClose(
  db: Database,
  actor: Actor,
  raw: unknown,
  now = new Date().toISOString(),
) {
  const range = z
    .object({ from: daySchema, through: daySchema })
    .strict()
    .parse(raw);
  if (
    range.from > range.through ||
    Date.parse(`${range.through}T00:00:00Z`) -
      Date.parse(`${range.from}T00:00:00Z`) >
      366 * 86400000
  )
    throw new ServiceError(
      400,
      "CLOSE_RANGE",
      "Choose an ordered accounting period of at most 366 days.",
    );
  const rows = await accountingExport(db, actor);
  const inPeriod = (date: string) =>
    date.slice(0, 10) >= range.from && date.slice(0, 10) <= range.through;
  const settled = rows.filter(
    (p) =>
      p.reconciliation_status === "settled" &&
      p.settled_at &&
      inPeriod(p.settled_at),
  );
  const payments = (
    await db.query<DeskPayment>(
      "SELECT * FROM payment_intents WHERE organization_id=$1",
      [actor.organizationId],
    )
  ).rows;
  const unattributedSettlements = payments
    .filter((p) => p.state === "settled" && !p.settled_at)
    .map((p) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      amount: p.amount,
      state: p.state,
      sourceTransaction: p.source_tx ?? "",
      destinationTransaction: p.destination_tx ?? "",
    }));
  // Open earlier operations are carried into close; an unproven failed operation is never silently released.
  const unresolved = payments
    .filter(
      (p) =>
        p.state !== "settled" &&
        !isReleased(p) &&
        String(p.created_at ? new Date(p.created_at).toISOString() : "").slice(
          0,
          10,
        ) <= range.through,
    )
    .map((p) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      amount: p.amount,
      state: p.state,
      sourceTransaction: p.source_tx ?? "",
      destinationTransaction: p.destination_tx ?? "",
    }));
  const ledgerRows = (
    await db.query<{
      payment_id: string | null;
      body: Record<string, unknown>;
      created_at: string;
    }>(
      "SELECT payment_id,body,created_at FROM ledger_events WHERE organization_id=$1 ORDER BY created_at,id",
      [actor.organizationId],
    )
  ).rows;
  const invalidLedgerDates = ledgerRows.filter(
    (r) =>
      typeof r.body.at !== "string" || !Number.isFinite(Date.parse(r.body.at)),
  );
  const ledger = ledgerRows
    .filter(
      (r) =>
        typeof r.body.at === "string" &&
        Number.isFinite(Date.parse(r.body.at)) &&
        inPeriod(new Date(r.body.at).toISOString()),
    )
    .map((r) => r.body);
  const missingLedger = settled
    .filter(
      (p) =>
        !ledgerRows.some(
          (r) =>
            r.payment_id === p.payment_id &&
            r.body.kind === "settlement" &&
            r.body.status === "settled",
        ),
    )
    .map((p) => p.payment_id);
  const unexportedSettled = payments
    .filter(
      (p) =>
        p.state === "settled" &&
        p.settled_at &&
        inPeriod(new Date(p.settled_at).toISOString()) &&
        !settled.some((r) => r.payment_id === p.id),
    )
    .map((p) => p.id);
  const warnings = [
    "Operational export; no claim of tax/accounting certification or bookkeeper acceptance.",
    ...(unresolved.length
      ? [
          `${unresolved.length} unresolved operation(s) require reconciliation; this period is incomplete.`,
        ]
      : []),
    ...(missingLedger.length
      ? [
          `${missingLedger.length} settled payment(s) lack a matching settlement ledger event; review historical imports and bookkeeping.`,
        ]
      : []),
    ...(invalidLedgerDates.length
      ? [
          "Some ledger occurrence timestamps are invalid or missing; their period cannot be certified.",
        ]
      : []),
    ...(unattributedSettlements.length
      ? [
          `${unattributedSettlements.length} settled payment(s) lack a recorded settlement/recognition time; their accounting period is unverified.`,
        ]
      : []),
    ...(settled.some((p) => p.source_currency !== "USDC")
      ? [
          "Source denomination differs from settlement asset; review conversion accounting.",
        ]
      : []),
  ];
  if (unexportedSettled.length)
    warnings.push(
      `${unexportedSettled.length} settlement(s) cannot join their invoice records; restore the missing source records before closing.`,
    );
  return {
    schemaVersion: 1,
    organizationId: actor.organizationId,
    generatedAt: now,
    period: range,
    complete:
      unresolved.length === 0 &&
      missingLedger.length === 0 &&
      invalidLedgerDates.length === 0 &&
      unexportedSettled.length === 0 &&
      unattributedSettlements.length === 0,
    settled,
    unresolved,
    ledger,
    missingLedger,
    unexportedSettled,
    unattributedSettlements,
    warnings,
    basis:
      "Settled rows use recorded settlement/recognition time. Ledger rows use event occurrence time rather than insertion time. Historical imports may record observation/recognition time instead of original chain time. Pending effects and missing ledger evidence stay disclosed. Records are not changed by export.",
  };
}
export function closeCsv(close: Awaited<ReturnType<typeof accountingClose>>) {
  const columns = [
    "row_type",
    "payment_id",
    "invoice_id",
    "invoice_reference",
    "vendor_name",
    "source_currency",
    "settlement_atomic_amount",
    "reconciliation_status",
    "settled_at",
    "source_transaction",
    "destination_transaction",
    "period_complete",
  ];
  const rows: Record<string, unknown>[] = [
    ...close.settled.map((p) => ({
      ...p,
      row_type: "settled",
      period_complete: close.complete,
    })),
    ...close.unresolved.map((p) => ({
      row_type: "unresolved",
      payment_id: p.id,
      invoice_id: p.invoiceId,
      settlement_atomic_amount: p.amount,
      reconciliation_status: p.state,
      source_transaction: p.sourceTransaction,
      destination_transaction: p.destinationTransaction,
      period_complete: false,
    })),
    ...close.unattributedSettlements.map((p) => ({
      row_type: "unattributed_settlement",
      payment_id: p.id,
      invoice_id: p.invoiceId,
      settlement_atomic_amount: p.amount,
      reconciliation_status: "settled_time_unverified",
      source_transaction: p.sourceTransaction,
      destination_transaction: p.destinationTransaction,
      period_complete: false,
    })),
  ];
  return [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
  ].join("\r\n");
}
