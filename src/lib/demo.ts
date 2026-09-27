import { createDemoFixture } from "./domain/fixtures";
import { verifyObligation } from "./domain/verifier";
import { transitionExecution, type Execution } from "./domain/execution";
import { reserveCoverage } from "./domain/coverage";
import { createReceipt } from "./domain/receipt";
export type InvoiceStatus = "ready" | "held" | "scheduled" | "settled";
export type DemoInvoice = {
  id: string;
  vendor: string;
  initials: string;
  reference: string;
  description: string;
  amountCents: number;
  due: string;
  status: InvoiceStatus;
  issue: "none" | "acceptance" | "destination" | "duplicate";
  reason: string;
  version: number;
  history: string[];
};
export const INITIAL_INVOICES: DemoInvoice[] = [
  {
    id: "inv-1042",
    vendor: "Northstar Studio",
    initials: "NS",
    reference: "NS-1042",
    description: "Product design · September retainer",
    amountCents: 320000,
    due: "2026-10-01",
    status: "held",
    issue: "acceptance",
    reason:
      "The agreement requires milestone acceptance. A merged design handoff is activity, but the named approver has not accepted delivery.",
    version: 1,
    history: [
      "Invoice received · Sep 28, 09:12",
      "Matched to design agreement v2",
      "Held: acceptance record missing",
    ],
  },
  {
    id: "inv-081",
    vendor: "Orbit Engineering",
    initials: "OE",
    reference: "ORB-081",
    description: "Engineering · September retainer",
    amountCents: 480000,
    due: "2026-10-02",
    status: "ready",
    issue: "none",
    reason:
      "Amount, recipient, approved terms, and authorized acceptance match. No prior payment against this obligation.",
    version: 1,
    history: [
      "Invoice received · Sep 28, 08:42",
      "Terms and acceptance verified",
      "Ready for a payment proposal",
    ],
  },
  {
    id: "inv-229",
    vendor: "Fieldwork Research",
    initials: "FR",
    reference: "FW-229",
    description: "Customer research · Sprint 12",
    amountCents: 175000,
    due: "2026-10-04",
    status: "scheduled",
    issue: "none",
    reason:
      "Valid obligation. Scheduled after earlier committed payments to preserve the operating buffer.",
    version: 1,
    history: [
      "Invoice received · Sep 27, 16:30",
      "Acceptance verified",
      "Scheduled: Oct 4",
    ],
  },
  {
    id: "inv-046",
    vendor: "Meridian Ops",
    initials: "MO",
    reference: "MER-046",
    description: "Operations · September support",
    amountCents: 240000,
    due: "2026-10-03",
    status: "held",
    issue: "destination",
    reason:
      "The destination on the invoice differs from the approved vendor register. An invoice cannot authorize a destination change.",
    version: 1,
    history: [
      "Invoice received · Sep 28, 07:18",
      "Recipient mismatch detected",
      "Held: authenticated destination change required",
    ],
  },
  {
    id: "inv-039",
    vendor: "Parallel Security",
    initials: "PS",
    reference: "PS-039",
    description: "Security review · Phase one",
    amountCents: 210000,
    due: "2026-09-26",
    status: "settled",
    issue: "none",
    reason:
      "Synthetic completed payment. Agreement, acceptance, and simulated destination receipt are matched.",
    version: 1,
    history: [
      "Acceptance approved · Sep 25",
      "Simulated source confirmation",
      "Simulated destination confirmation · Sep 26",
    ],
  },
  {
    id: "inv-1042b",
    vendor: "Northstar Studio",
    initials: "NS",
    reference: "NS-1042-R",
    description: "Product design · Resent invoice",
    amountCents: 320000,
    due: "2026-10-01",
    status: "held",
    issue: "duplicate",
    reason:
      "A new invoice reference points to the same September obligation as NS-1042. Both invoices cannot allocate the same obligation.",
    version: 1,
    history: [
      "Invoice received · Sep 28, 10:06",
      "Same vendor, period, amount and deliverable as NS-1042",
      "Held: suspected duplicate obligation",
    ],
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(cents / 100);
export function parseInvoiceInput(input: {
  vendor: string;
  reference: string;
  amount: string;
  due: string;
}): DemoInvoice {
  if (!input.vendor.trim() || !input.reference.trim())
    throw new Error("Vendor and invoice reference are required.");
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount))
    throw new Error(
      "Enter a positive amount with no more than two decimal places.",
    );
  const amountCents = Math.round(Number(input.amount) * 100);
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > 100000000
  )
    throw new Error("Amount must be between $0.01 and $1,000,000.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.due) ||
    Number.isNaN(Date.parse(input.due)) ||
    new Date(input.due).toISOString().slice(0, 10) !== input.due
  )
    throw new Error("Choose a valid due date.");
  return {
    id: `sample-${crypto.randomUUID()}`,
    vendor: input.vendor.trim(),
    initials: input.vendor
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    reference: input.reference.trim(),
    description: "Imported sample · Acceptance needed",
    amountCents,
    due: input.due,
    status: "held",
    issue: "acceptance",
    reason:
      "New sample invoice requires an approved engagement and authorized acceptance. No money can move in this sandbox.",
    version: 1,
    history: ["Sample invoice added", "Held: acceptance required"],
  };
}
export function resolveAcceptance(invoice: DemoInvoice): DemoInvoice {
  if (invoice.issue !== "acceptance" || invoice.status !== "held")
    throw new Error("This exception requires a different resolution.");
  return {
    ...invoice,
    status: "ready",
    issue: "none",
    reason:
      "Synthetic operator acceptance recorded. Approved terms and recipient unchanged. Ready for a proposal in this sandbox only.",
    version: invoice.version + 1,
    history: [
      ...invoice.history,
      "Sample operator accepted delivery",
      "Decision revised: held → ready",
    ],
  };
}
export function planPayments(invoices: DemoInvoice[], availableCents: number) {
  let remaining = availableCents;
  return invoices
    .filter((i) => i.status === "ready" || i.status === "scheduled")
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((i) => {
      const funded = i.amountCents <= remaining;
      if (funded) remaining -= i.amountCents;
      return { ...i, funded, remainingCents: remaining };
    });
}
export function toCsv(invoices: DemoInvoice[]) {
  const escape = (value: string) =>
    `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return [
    "Invoice,Vendor,Description,Amount USD,Due,Status,Environment",
    ...invoices.map((i) =>
      [
        i.reference,
        i.vendor,
        i.description,
        (i.amountCents / 100).toFixed(2),
        i.due,
        i.status,
        "synthetic sandbox",
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");
}

/** Pure local fixtures execute production reducers; they never invoke a provider or signer. */
export function runRecoveryScenario(id: string): string {
  const fixture = createDemoFixture();
  const execution: Execution = {
    paymentId: "op_sample_0042",
    tenantId: "demo-org",
    state: "submitted",
    sourceChainId: 5042002,
    destinationChainId: 8453,
    recipient: "0x1111111111111111111111111111111111111111",
    asset: "USDC",
    amount: "800000000",
    permitHash: "fixture-permit",
    attempt: 1,
    updatedAt: fixture.now,
    providerRequestId: "fixture-request",
  };
  if (id === "duplicate") {
    const result = verifyObligation(createDemoFixture("duplicate"));
    return `${result.action}: ${result.reason} Findings: ${result.findings.map((f) => f.code).join(", ")}. The same obligation cannot be allocated twice, even with a different invoice reference.`;
  }
  if (id === "malicious") {
    const result = verifyObligation(createDemoFixture("destination-change"));
    return `${result.action}: ${result.reason} Findings: ${result.findings.map((f) => f.code).join(", ")}. Invoice content cannot rewrite the approved vendor register.`;
  }
  if (id === "stale") {
    const changed = {
      ...fixture,
      engagement: { ...fixture.engagement, version: 2 },
      invoice: { ...fixture.invoice, engagementVersion: 2 },
    };
    const result = verifyObligation(changed);
    return `${result.action}: ${result.reason} Findings: ${result.findings.map((f) => f.code).join(", ")}. Acceptance for agreement version 1 does not authorize version 2.`;
  }
  if (id === "bridge") {
    const result = transitionExecution(execution, {
      type: "source-confirmed",
      transaction: "fixture-source-transaction",
      finalized: true,
      at: fixture.now,
    });
    return `State: ${result.state}. Operation: ${result.paymentId}. Source is recorded; destination transaction is ${result.destinationTransaction ?? "absent"}. The payment is not settled. Only the exact matching destination observation can complete this route.`;
  }
  if (id === "timeout") {
    const uncertain = transitionExecution(execution, {
      type: "uncertain",
      at: fixture.now,
    });
    try {
      transitionExecution(uncertain, {
        type: "submitted",
        providerRequestId: "new-request",
        at: fixture.now,
      });
      return "Unexpected result: another submission was accepted. Review the execution reducer.";
    } catch (error) {
      return `State: ${uncertain.state}. Operation retained: ${uncertain.paymentId}. Repeat submission rejected: ${error instanceof Error ? error.message : "invalid transition"}. Reconcile the existing operation before any new execution.`;
    }
  }
  if (id === "reserve") {
    try {
      reserveCoverage(
        {
          funded: "0",
          otherLiabilities: "0",
          paidClaims: "0",
          allocations: [],
          claims: [],
        },
        {
          id: "sample-allocation",
          paymentId: "sample-payment",
          invoiceId: "sample-invoice",
          tenantId: "demo-org",
          permitHash: "fixture-permit",
          cap: "1000000",
          recoveryDestination: execution.recipient,
          termsVersion: 1,
        },
      );
      return "Unexpected result: unfunded coverage was accepted. Review the coverage reducer.";
    } catch (error) {
      return `Coverage rejected: ${error instanceof Error ? error.message : "invalid reserve"}. Funded reserve: $0. New advertised liability: $0. The allocation was not created.`;
    }
  }
  throw new Error("Unknown recovery scenario");
}

/** Production receipt schema with explicitly synthetic identities; never asserts settlement. */
export function createDemoReceipt(invoice: DemoInvoice) {
  const scenario =
    invoice.issue === "acceptance"
      ? "missing-acceptance"
      : invoice.issue === "destination"
        ? "destination-change"
        : invoice.issue === "duplicate"
          ? "duplicate"
          : "ready";
  const base = createDemoFixture(scenario);
  const amount = (BigInt(invoice.amountCents) * 10000n).toString();
  const ceiling = (BigInt(amount) * 4n).toString();
  const fixture = {
    ...base,
    engagement: {
      ...base.engagement,
      amount,
      commitmentCeiling: ceiling,
      mode: "observe" as const,
    },
    invoice: {
      ...base.invoice,
      id: invoice.id,
      reference: invoice.reference,
      version: invoice.version,
      amount,
    },
    policy: {
      ...base.policy,
      perPaymentCap: ceiling,
      remainingDelegation: ceiling,
      rolling24hRemaining: ceiling,
    },
    allocations: base.allocations.map((a) => ({ ...a, amount })),
  };
  const checked = verifyObligation(fixture);
  const decision = {
    ...checked,
    reason: `SYNTHETIC SANDBOX. No payment or chain settlement is asserted. ${checked.reason}`,
  };
  return createReceipt({
    id: `synthetic-${invoice.id}-v${invoice.version}`,
    decision,
    permit: {
      paymentId: `synthetic-operation-${invoice.id}`,
      recipient: base.engagement.destinations[0].address,
      amount,
      sourceChainId: 5042002,
      destinationChainId: 8453,
      asset: "USDC",
      policyVersion: decision.policyVersion,
      engagementVersion: decision.engagementVersion,
      expiresAt: decision.validUntil,
    },
    settlement: null,
    evidenceCommitments: [],
    createdAt: base.now,
  });
}
