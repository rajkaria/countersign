import type { VerificationInput } from "./types";
export type DemoScenario =
  | "ready"
  | "missing-acceptance"
  | "destination-change"
  | "duplicate"
  | "stale-history"
  | "policy-paused"
  | "partial";
/** Synthetic, isolated fixture. Its dates and addresses are not live integrations or customer evidence. */
export function createDemoFixture(
  scenario: DemoScenario = "ready",
): VerificationInput {
  const now = "2026-09-28T10:00:00.000Z";
  const source = {
    id: "agreement-source",
    uri: "fixture://agreement",
    location: "Section 2",
    hash: "a".repeat(64),
    observedAt: now,
  };
  const destination = {
    chainId: 5042002,
    address: "0x1111111111111111111111111111111111111111",
    version: 1,
    verifiedBy: "owner-2",
    verifiedAt: "2026-09-01T00:00:00Z",
  };
  const base: VerificationInput = {
    tenantId: "demo-org",
    now,
    engagement: {
      id: "eng-design",
      tenantId: "demo-org",
      vendorId: "vendor-studio",
      version: 1,
      approvedBy: "owner-1",
      approvedAt: "2026-09-01T00:00:00Z",
      status: "active",
      mode: "delegate",
      effectiveFrom: "2026-09-01T00:00:00Z",
      effectiveUntil: "2027-01-01T00:00:00Z",
      billingModel: "retainer",
      currency: "USDC",
      amount: "800000000",
      commitmentCeiling: "3200000000",
      partialPayments: false,
      authorizedAcceptors: ["owner-1"],
      acceptanceRequired: true,
      acceptanceMaxAgeSeconds: 86400,
      destinations: [destination],
      asset: {
        symbol: "USDC",
        chainId: 5042002,
        address: "0x3600000000000000000000000000000000000000",
        decimals: 6,
      },
      source,
    },
    invoice: {
      id: "inv-1042",
      tenantId: "demo-org",
      vendorId: "vendor-studio",
      engagementId: "eng-design",
      engagementVersion: 1,
      version: 1,
      obligationId: "design-2026-09",
      reference: "STUDIO-1042",
      periodStart: "2026-09-01T00:00:00Z",
      periodEnd: "2026-10-01T00:00:00Z",
      dueAt: now,
      amount: "800000000",
      currency: "USDC",
      destination,
      description: "September design retainer",
      source: {
        ...source,
        id: "invoice-source",
        uri: "fixture://invoice",
        location: "Total",
      },
      status: "matched",
    },
    policy: {
      id: "policy-demo",
      tenantId: "demo-org",
      version: 1,
      paused: false,
      perPaymentCap: "1000000000",
      remainingDelegation: "3000000000",
      rolling24hRemaining: "2000000000",
      expiresAt: "2026-12-31T00:00:00Z",
      coverageRequired: false,
    },
    expectedPolicyVersion: 1,
    acceptances: [
      {
        id: "acceptance-1",
        tenantId: "demo-org",
        engagementId: "eng-design",
        engagementVersion: 1,
        obligationId: "design-2026-09",
        actorId: "owner-1",
        acceptedAt: "2026-09-28T09:00:00Z",
        expiresAt: "2026-09-29T09:00:00Z",
        kind: "acceptance",
        source: {
          ...source,
          id: "acceptance-source",
          uri: "fixture://acceptance",
          location: "Customer confirmation",
        },
        revoked: false,
      },
    ],
    allocations: [],
    historySyncedAt: "2026-09-28T09:59:00Z",
    historyMaxAgeSeconds: 300,
    unmatchedExternalTransfers: false,
  };
  if (scenario === "missing-acceptance")
    return {
      ...base,
      acceptances: base.acceptances.map((a) => ({ ...a, kind: "activity" })),
    };
  if (scenario === "destination-change")
    return {
      ...base,
      invoice: {
        ...base.invoice,
        destination: {
          ...destination,
          address: "0x2222222222222222222222222222222222222222",
        },
      },
    };
  if (scenario === "duplicate")
    return {
      ...base,
      allocations: [
        {
          id: "allocation-old",
          tenantId: base.tenantId,
          engagementId: base.engagement.id,
          obligationId: base.invoice.obligationId,
          invoiceId: "renamed-invoice",
          paymentId: "old-payment",
          amount: "800000000",
          state: "settled",
        },
      ],
    };
  if (scenario === "stale-history")
    return { ...base, historySyncedAt: "2026-09-27T10:00:00Z" };
  if (scenario === "policy-paused")
    return { ...base, policy: { ...base.policy, paused: true } };
  if (scenario === "partial")
    return {
      ...base,
      requestedAmount: "400000000",
      engagement: { ...base.engagement, partialPayments: true },
    };
  return base;
}
