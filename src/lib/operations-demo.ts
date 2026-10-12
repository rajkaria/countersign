import type { operationsDesk } from "./server/operations";
/** Deliberately isolated sample. Never fetched from, saved to, or executed against a real workspace. */
export function demoOperations(): Awaited<ReturnType<typeof operationsDesk>> {
  const owner = "0x1111111111111111111111111111111111111111";
  const iso = new Date().toISOString();
  const due = (offset: number) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const invoices = [
    {
      id: "sample-hourly",
      reference: "ORBIT-082",
      amount: "1800000000",
      outstanding: "1200000000",
      settled: "600000000",
      committed: "300000000",
      unallocated: "900000000",
      dueDate: due(-2),
      daysUntilDue: -2,
      status: "partially_paid",
      warnings: [
        "A sample partial payment is uncertain. Reconcile its original operation before preparing the remainder.",
      ],
    },
    {
      id: "sample-acceptance",
      reference: "NS-1043",
      amount: "3200000000",
      outstanding: "3200000000",
      settled: "0",
      committed: "0",
      unallocated: "3200000000",
      dueDate: due(2),
      daysUntilDue: 2,
      status: "needs_review",
      warnings: [
        "Sample customer acceptance is missing. Activity evidence alone cannot authorize payment.",
      ],
    },
    {
      id: "sample-routine",
      reference: "FIELD-230",
      amount: "1750000000",
      outstanding: "1750000000",
      settled: "0",
      committed: "0",
      unallocated: "1750000000",
      dueDate: due(6),
      daysUntilDue: 6,
      status: "received",
      warnings: [],
    },
  ].map((r) => ({
    ...r,
    version: 1,
    vendorId: "sample-vendor",
    engagementId: "sample-engagement",
    currency: "USDC",
    paymentIds: [],
    duplicate: false,
  }));
  return {
    deliveries: [],
    summary: {
      unattributedCommittedUSDC: "0",
      totals: {
        USDC: {
          invoiced: "6750000000",
          settled: "600000000",
          committed: "300000000",
          outstanding: "6150000000",
          unallocated: "5850000000",
          overdue: "1200000000",
          dueSoon: "4950000000",
        },
      },
      duplicateObligations: 0,
      asOf: iso,
      limitation:
        "Synthetic sample records. Current dates demonstrate the workflow; no customer, balance or settlement evidence is claimed.",
      invoices: undefined,
    },
    invoices,
    cases: [
      {
        id: "sample-case",
        kind: "case",
        version: 1,
        body: {
          invoiceId: "sample-acceptance",
          vendorId: "sample-vendor",
          title: "Confirm the delivered design milestone",
          reason:
            "Review the handoff and request acceptance from the named customer approver.",
          owner,
          status: "awaiting_evidence",
          resolution: "",
          priority: "high",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        },
        created_at: iso,
        updated_at: iso,
        escalated: false,
      },
    ],
    members: [{ wallet: owner, role: "owner" }],
    preferences: {
      version: 0,
      preferences: {
        notificationsEnabled: false,
        timezone: "UTC",
        quietHoursEnabled: false,
        quietStart: "22:00",
        quietEnd: "08:00",
        reminderDays: 3,
        escalationHours: 48,
      },
    },
    digest: {
      allowed: false,
      reason: "Sample notifications are disabled.",
      previewOnly: true,
      sent: false,
      note: "Synthetic reminder preview. Changes stay in this view and no messages are sent.",
      notices: [
        {
          kind: "overdue",
          id: "sample-hourly",
          message:
            "ORBIT-082: sample overdue remainder; reconcile the uncertain partial operation.",
          actionLabel: "Review invoice and evidence",
          review: { view: "invoices", invoiceId: "sample-hourly" },
          href: "#ops-invoice-sample-hourly",
        },
        {
          kind: "exception",
          id: "sample-case",
          message:
            "Design milestone: request authorized acceptance, then reevaluate.",
          actionLabel: "Review exception and evidence",
          review: {
            view: "invoices",
            invoiceId: "sample-acceptance",
            caseId: "sample-case",
          },
          href: "#ops-case-sample-case",
        },
      ],
    },
  };
}
