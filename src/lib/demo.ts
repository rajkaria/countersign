import { createDemoFixture } from "./domain/fixtures";
import { verifyObligation } from "./domain/verifier";
import { transitionExecution, type Execution } from "./domain/execution";
import { reserveCoverage } from "./domain/coverage";
import { commitment, createReceipt } from "./domain/receipt";
import { planCommitments } from "./domain/planner";
import { validateProposal } from "./integrations/agent";
import type { VerificationInput } from "./domain/types";
export type InvoiceStatus = "ready" | "held" | "scheduled" | "settled";
export type DemoInvoice = {
  id: string;
  vendor: string;
  initials: string;
  reference: string;
  description: string;
  amountCents: number;
  currency: "USD" | "USDC";
  due: string;
  status: InvoiceStatus;
  issue: "none" | "acceptance" | "destination" | "duplicate" | "source";
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
    currency: "USDC",
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
    currency: "USDC",
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
    currency: "USDC",
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
    currency: "USDC",
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
    currency: "USDC",
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
    currency: "USDC",
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
    minimumFractionDigits: 2,
  }).format(cents / 100);
export const UNVERIFIED_SAMPLE_REASON =
  "Source required: this custom invoice has no approved agreement, trusted destination, or authorized acceptance. It remains on hold. No money can move in this sandbox.";
export const isDemoFixture = (invoice: DemoInvoice) =>
  INITIAL_INVOICES.some((sample) => sample.id === invoice.id);
export const invoiceMoney = (invoice: DemoInvoice) =>
  invoice.currency === "USD"
    ? money(invoice.amountCents)
    : new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(invoice.amountCents / 100);
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
    description: "Custom sample · Source required",
    amountCents,
    currency: "USD",
    due: input.due,
    status: "held",
    issue: "source",
    reason: UNVERIFIED_SAMPLE_REASON,
    version: 1,
    history: ["Custom sample invoice added", "Held: approved sources required"],
  };
}
export function resolveAcceptance(invoice: DemoInvoice): DemoInvoice {
  if (
    !isDemoFixture(invoice) ||
    invoice.issue !== "acceptance" ||
    invoice.status !== "held"
  )
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
export function planPayments(
  invoices: DemoInvoice[],
  availableCents = 1050000,
) {
  if (!Number.isSafeInteger(availableCents) || availableCents < 0)
    throw new Error("Demo cash must be nonnegative whole cents.");
  const input = {
    confirmedCash: ((BigInt(availableCents) + 800000n) * 10000n).toString(),
    operatingReserve: "8000000000",
    protectedReserve: "0",
    pendingReserve: "0",
    expectedInflows: "4000000000",
    now: createDemoFixture().now,
    items: invoices
      .filter((invoice) => invoice.status !== "settled")
      .map((invoice) => ({
        id: invoice.id,
        // Other denominations are displayed as held, never compared to USDC cash.
        amount:
          invoice.currency === "USDC"
            ? (BigInt(invoice.amountCents) * 10000n).toString()
            : "0",
        fee: "0",
        dueAt: `${invoice.due}T23:59:59Z`,
        priority: 1,
        eligible:
          isDemoFixture(invoice) &&
          invoice.currency === "USDC" &&
          getDemoReview(invoice).decision.action === "PAY" &&
          ["ready", "scheduled"].includes(invoice.status),
        allowEarly: false,
      })),
  };
  const result = planCommitments(input);
  return {
    ...result,
    input,
    items: result.items.map((item) => ({
      ...item,
      invoice: invoices.find((invoice) => invoice.id === item.id)!,
    })),
  };
}
export function toCsv(invoices: DemoInvoice[]) {
  const escape = (value: string) =>
    `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return [
    "Invoice,Vendor,Description,Amount,Currency,Due,Status,Environment",
    ...invoices.map((i) =>
      [
        i.reference,
        i.vendor,
        i.description,
        (i.amountCents / 100).toFixed(2),
        i.currency,
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
    destinationChainId: id === "timeout" ? 5042002 : 8453,
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

/** Inspectable fictional sources and the real verifier; the proposal is an authored recorded fixture, not a provider response. */
export function getDemoReview(invoice: DemoInvoice) {
  const approvedTerms = isDemoFixture(invoice);
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
  const group = invoice.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const engagementId = `synthetic-agreement-${group}`;
  const vendorId = `synthetic-vendor-${group}`;
  const obligationId = `synthetic-obligation-${group}`;
  const sourceId = (kind: string) => `${invoice.id}-${kind}`;
  const sources = [
    ...(approvedTerms
      ? [
          {
            id: sourceId("agreement"),
            title: "Fictional approved agreement",
            location: "Section 2 · terms and acceptance",
            content: `Fictional agreement v2. ${invoice.vendor}: ${invoice.description}. Amount: ${invoiceMoney(invoice)} ${invoice.currency}. The named customer acceptor owner-1 must confirm the current obligation before release. Activity is evidence of progress, not acceptance. The fictional approved destination is ${base.engagement.destinations[0].address}.`,
          },
        ]
      : []),
    {
      id: sourceId("invoice"),
      title: "Synthetic received invoice",
      location: "Reference, total and due date",
      content: `${invoice.reference}. ${invoice.vendor}. Total: ${invoiceMoney(invoice)} ${invoice.currency}. Due: ${invoice.due}. ${approvedTerms ? `Claimed destination: ${base.invoice.destination.address}.` : "No original document, billing period or destination was supplied. These typed fields are unverified."}`,
    },
    ...(approvedTerms
      ? [
          {
            id: sourceId(
              invoice.issue === "acceptance" ? "activity" : "acceptance",
            ),
            title:
              invoice.issue === "acceptance"
                ? "Fictional delivery activity"
                : "Fictional customer acceptance",
            location:
              invoice.issue === "acceptance"
                ? "Delivery handoff note"
                : "Current obligation approval",
            content:
              invoice.issue === "acceptance"
                ? "The design handoff was merged and delivered. This activity note has no statement of acceptance by the named customer acceptor. Activity is evidence of progress; acceptance is still missing."
                : "Fictional customer acceptor owner-1 confirmed the current obligation against approved agreement v2. This is a sample approval, not real customer evidence.",
          },
        ]
      : []),
  ];
  const ref = (kind: string) => {
    const source = sources.find((item) => item.id === sourceId(kind));
    return {
      id: sourceId(kind),
      uri: `fixture://${sourceId(kind)}`,
      location: source?.location ?? "Source required",
      hash: commitment({
        content: source?.content ?? "No approved source supplied",
      }).slice(2),
      observedAt: base.now,
    };
  };
  const input: VerificationInput = {
    ...base,
    engagement: {
      ...base.engagement,
      id: engagementId,
      vendorId,
      version: 2,
      status: approvedTerms ? "active" : "draft",
      approvedBy: approvedTerms ? "owner-1" : "",
      authorizedAcceptors: approvedTerms
        ? base.engagement.authorizedAcceptors
        : [],
      destinations: approvedTerms ? base.engagement.destinations : [],
      currency: invoice.currency,
      amount,
      commitmentCeiling: ceiling,
      mode: "observe" as const,
      source: ref("agreement"),
    },
    invoice: {
      ...base.invoice,
      id: invoice.id,
      vendorId,
      engagementId,
      engagementVersion: 2,
      obligationId,
      reference: invoice.reference,
      version: invoice.version,
      amount,
      currency: invoice.currency,
      description: invoice.description,
      dueAt: `${invoice.due}T23:59:59Z`,
      destination: approvedTerms
        ? base.invoice.destination
        : {
            ...base.invoice.destination,
            chainId: 0,
            address: "0x0000000000000000000000000000000000000000",
            version: 0,
            verifiedBy: "",
          },
      source: ref("invoice"),
    },
    policy: {
      ...base.policy,
      perPaymentCap: ceiling,
      remainingDelegation: ceiling,
      rolling24hRemaining: ceiling,
    },
    acceptances: approvedTerms
      ? base.acceptances.map((acceptance) => ({
          ...acceptance,
          engagementId,
          engagementVersion: 2,
          obligationId,
          source: ref(
            invoice.issue === "acceptance" ? "activity" : "acceptance",
          ),
        }))
      : [],
    allocations: base.allocations.map((a) => ({
      ...a,
      engagementId,
      obligationId,
      amount,
    })),
  };
  const decision = verifyObligation(input);
  const modelFixture = approvedTerms
    ? {
        kind: "recorded-fixture" as const,
        modelExecuted: false as const,
        authority: "proposal-only" as const,
        proposal: validateProposal(
          {
            action: decision.action,
            reason:
              invoice.issue === "acceptance"
                ? "The handoff describes completed activity. The agreement separately requires customer acceptance; the activity note cannot supply that approval. Ask the named acceptor a precise question before preparing payment."
                : decision.reason,
            sourceIds: sources.map((source) => source.id),
            missing:
              invoice.issue === "acceptance"
                ? [
                    `Does the named customer acceptor accept the ${invoice.description} obligation against agreement v2?`,
                  ]
                : decision.action === "HOLD"
                  ? [decision.nextCheck]
                  : [],
          },
          {
            allowedActions: decision.availableActions,
            sourceIds: decision.sourceIds,
          },
        ),
      }
    : null;
  return { approvedTerms, input, sources, decision, modelFixture };
}

/** Production receipt schema with explicitly synthetic identities; never asserts settlement. */
export function createDemoReceipt(invoice: DemoInvoice) {
  if (!isDemoFixture(invoice))
    throw new Error(
      "Approved source evidence is required before exporting a decision receipt.",
    );
  const review = getDemoReview(invoice);
  const decision = {
    ...review.decision,
    reason: `SYNTHETIC SANDBOX. No payment or chain settlement is asserted. ${review.decision.reason}`,
  };
  return createReceipt({
    id: `synthetic-${invoice.id}-v${invoice.version}`,
    decision,
    permit: {
      paymentId: `synthetic-operation-${invoice.id}`,
      recipient: review.input.engagement.destinations[0].address,
      amount: decision.amount,
      sourceChainId: 5042002,
      destinationChainId: review.input.invoice.destination.chainId,
      asset: "USDC",
      policyVersion: decision.policyVersion,
      engagementVersion: decision.engagementVersion,
      expiresAt: decision.validUntil,
    },
    settlement: null,
    evidenceCommitments: review.sources.map((source) =>
      commitment({ content: source.content }),
    ),
    createdAt: review.input.now,
  });
}
