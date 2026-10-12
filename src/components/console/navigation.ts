import type { WorkspaceRecord, WorkspacePayment } from "./format";

export type ConsoleTarget = {
  org: string;
  view: string;
  invoice?: string;
  caseId?: string;
  payment?: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const views = new Set([
  "overview",
  "invoice",
  "operations",
  "activity",
  "setup",
]);

export function consoleTarget(
  search: string,
  organizations: readonly { id: string }[],
): ConsoleTarget | null {
  const params = new URLSearchParams(search);
  if (
    !["org", "view", "invoice", "case", "payment"].some((key) =>
      params.has(key),
    )
  )
    return null;
  for (const key of ["org", "view", "invoice", "case", "payment"]) {
    if (params.getAll(key).length > 1)
      throw new Error("This workspace link contains conflicting targets.");
  }
  const org = params.get("org");
  if (!org || !organizations.some((entry) => entry.id === org))
    throw new Error("This link is outside your current workspace access.");
  const requestedView = params.get("view") ?? "invoices";
  const view =
    requestedView === "history"
      ? "activity"
      : requestedView === "invoices"
        ? "invoice"
        : requestedView;
  if (!views.has(view))
    throw new Error("This workspace link has an unsupported destination.");
  const target: ConsoleTarget = { org, view };
  for (const [key, name] of [
    ["invoice", "invoice"],
    ["case", "caseId"],
    ["payment", "payment"],
  ] as const) {
    const value = params.get(key);
    if (value !== null) {
      if (!uuid.test(value))
        throw new Error(
          "This workspace link has an invalid record identifier.",
        );
      target[name] = value;
    }
  }
  return target;
}

export function resolveConsoleTarget(
  target: ConsoleTarget,
  records: WorkspaceRecord[],
  payments: WorkspacePayment[],
) {
  const invoice = target.invoice
    ? records.find((r) => r.id === target.invoice && r.kind === "invoice")
    : undefined;
  const exception = target.caseId
    ? records.find((r) => r.id === target.caseId && r.kind === "case")
    : undefined;
  const payment = target.payment
    ? payments.find((p) => p.id === target.payment)
    : undefined;
  if (
    (target.invoice && !invoice) ||
    (target.caseId && !exception) ||
    (target.payment && !payment)
  )
    throw new Error(
      "The linked record is unavailable in this workspace. It may have changed or been removed.",
    );
  if (
    exception &&
    target.invoice &&
    exception.body.invoiceId !== target.invoice
  )
    throw new Error("The linked case does not belong to this invoice.");
  if (payment && target.invoice && payment.invoice_id !== target.invoice)
    throw new Error("The linked payment does not belong to this invoice.");
  return { invoice, exception, payment };
}

/** Explicit targets can outlive the bounded activity snapshot; callers bind every read to the authenticated organization. */
export async function hydrateConsoleTarget(
  target: ConsoleTarget,
  snapshot: { records: WorkspaceRecord[]; payments: WorkspacePayment[] },
  readRecord: (kind: string, id: string) => Promise<WorkspaceRecord>,
  readPayment: (id: string) => Promise<WorkspacePayment>,
) {
  const records = [...snapshot.records],
    payments = [...snapshot.payments];
  for (const [kind, id] of [
    ["invoice", target.invoice],
    ["case", target.caseId],
  ] as const) {
    if (id && !records.some((r) => r.id === id && r.kind === kind)) {
      const row = await readRecord(kind, id);
      if (row.id !== id || row.kind !== kind)
        throw new Error(
          "The linked record response does not match its requested identity.",
        );
      records.push(row);
    }
  }
  if (target.payment && !payments.some((p) => p.id === target.payment)) {
    const row = await readPayment(target.payment);
    if (row.id !== target.payment)
      throw new Error(
        "The linked payment response does not match its requested identity.",
      );
    payments.push(row);
  }
  const resolved = resolveConsoleTarget(target, records, payments);
  for (const [kind, value] of [
    ["engagement", resolved.invoice?.body.engagementId],
    ["vendor", resolved.invoice?.body.vendorId],
  ] as const) {
    if (
      typeof value === "string" &&
      uuid.test(value) &&
      !records.some((r) => r.id === value && r.kind === kind)
    ) {
      const row = await readRecord(kind, value);
      if (row.id !== value || row.kind !== kind)
        throw new Error(
          "The linked context response does not match its requested identity.",
        );
      records.push(row);
    }
  }
  return { records, payments };
}
