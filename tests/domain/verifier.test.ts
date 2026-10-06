import { describe, expect, it } from "vitest";
import {
  createDemoFixture,
  verifyObligation,
  planCommitments,
  diffDecisions,
  units,
  formatUnits,
} from "../../src/lib/domain";

describe("independent release conditions", () => {
  it("releases an exact approved and accepted obligation", () => {
    const f = createDemoFixture();
    expect(verifyObligation(f).action).toBe("PAY");
  });
  it("activity cannot stand in for authorized acceptance", () => {
    const f = createDemoFixture("missing-acceptance");
    const d = verifyObligation(f);
    expect(d.action).toBe("ASK");
    expect(d.executable).toBe(false);
  });
  it("holds changed invoice IDs against a satisfied obligation", () => {
    const f = createDemoFixture("duplicate");
    expect(verifyObligation(f).findings.map((x) => x.code)).toContain(
      "OBLIGATION_CAP",
    );
  });
  it("accepts distinct recurring periods", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({
        ...f,
        allocations: [
          {
            id: "old",
            tenantId: f.tenantId,
            engagementId: f.engagement.id,
            obligationId: "august",
            invoiceId: "old",
            paymentId: "old",
            amount: "800000000",
            state: "settled",
          },
        ],
      }).action,
    ).toBe("PAY");
  });
  it("requires trusted destinations regardless of instructions", () => {
    expect(
      verifyObligation(createDemoFixture("destination-change")).action,
    ).toBe("HOLD");
  });
  it("fails closed on stale acceptance and policy changes", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, expectedPolicyVersion: 2 }).executable,
    ).toBe(false);
    expect(
      verifyObligation({ ...f, now: "2026-10-10T00:00:00.000Z" }).executable,
    ).toBe(false);
  });
  it("retains pending commitment and blocks unmatched external activity", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, unmatchedExternalTransfers: true }).executable,
    ).toBe(false);
    const partial = {
      ...f,
      allocations: [
        {
          id: "pending",
          tenantId: f.tenantId,
          engagementId: f.engagement.id,
          obligationId: f.invoice.obligationId,
          invoiceId: "other",
          paymentId: "other",
          amount: "400000000",
          state: "reserved" as const,
        },
      ],
    };
    expect(verifyObligation(partial).executable).toBe(false);
  });
  it("does not authorize partial payment without approved terms", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, requestedAmount: "400000000" }).action,
    ).toBe("PROPOSE_PARTIAL");
    expect(
      verifyObligation({
        ...f,
        requestedAmount: "400000000",
        engagement: { ...f.engagement, partialPayments: true },
      }).executable,
    ).toBe(true);
  });
  it("isolates tenant and vendor identity", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, invoice: { ...f.invoice, tenantId: "foreign" } })
        .executable,
    ).toBe(false);
    expect(
      verifyObligation({
        ...f,
        acceptances: f.acceptances.map((a) => ({ ...a, actorId: "vendor" })),
      }).executable,
    ).toBe(false);
  });
  it("rejects malformed amounts and dates without throwing from verification", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, invoice: { ...f.invoice, amount: "1e8" } })
        .action,
    ).toBe("HOLD");
    expect(verifyObligation({ ...f, now: "bad" }).action).toBe("HOLD");
  });
  it("reports decision differences without invented savings", () => {
    const before = verifyObligation(createDemoFixture("missing-acceptance"));
    const after = verifyObligation(createDemoFixture());
    expect(diffDecisions(before, after).actionChanged).toBe(true);
  });
});
describe("integer money and commitment scheduling", () => {
  it("parses large exact amounts and refuses precision loss", () => {
    expect(units("9007199254740993.123456", 6)).toBe(9007199254740993123456n);
    expect(formatUnits(1234567n, 6)).toBe("1.234567");
    expect(() => units("1.0000001", 6)).toThrow();
    expect(() => units("-1", 6)).toThrow();
  });
  it("protects obligations and never spends expected revenue", () => {
    const p = planCommitments({
      confirmedCash: "3000000000",
      operatingReserve: "500000000",
      protectedReserve: "1500000000",
      pendingReserve: "0",
      expectedInflows: "10000000000",
      now: "2026-09-28T00:00:00Z",
      items: [
        {
          id: "A",
          amount: "800000000",
          fee: "0",
          dueAt: "2026-09-28T00:00:00Z",
          priority: 1,
          eligible: true,
        },
        {
          id: "B",
          amount: "600000000",
          fee: "0",
          dueAt: "2026-09-29T00:00:00Z",
          priority: 2,
          eligible: true,
        },
      ],
    });
    expect(p.items.map((x) => x.action)).toEqual(["PAY", "SCHEDULE"]);
    expect(p.remainingCash).toBe("2200000000");
    expect(p.items[1].shortfall).toBe("400000000");
  });
});
describe("adversarial approved terms and precision", () => {
  it("requires confirmed matching rather than an unreviewed extracted invoice", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({ ...f, invoice: { ...f.invoice, status: "received" } })
        .executable,
    ).toBe(false);
  });
  it("never permits a negative allocation to restore spending capacity", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({
        ...f,
        allocations: [
          {
            id: "credit",
            tenantId: f.tenantId,
            engagementId: f.engagement.id,
            obligationId: f.invoice.obligationId,
            invoiceId: f.invoice.id,
            paymentId: "p",
            amount: "-1",
            state: "settled",
          },
        ],
      }).executable,
    ).toBe(false);
  });
  it("requires approved hourly quantities and rate arithmetic", () => {
    const f = createDemoFixture();
    const hourly = {
      ...f,
      engagement: {
        ...f.engagement,
        billingModel: "hourly" as const,
        hourlyRate: "100000000",
        maximumQuantity: "8",
      },
      invoice: { ...f.invoice, quantity: "8" },
    };
    expect(verifyObligation(hourly).action).toBe("PAY");
    expect(
      verifyObligation({
        ...hourly,
        invoice: { ...hourly.invoice, quantity: "7" },
      }).executable,
    ).toBe(false);
  });
  it("terms amendments cannot retroactively apply outside effective period", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({
        ...f,
        engagement: { ...f.engagement, effectiveFrom: "2026-09-15T00:00:00Z" },
      }).findings.map((x) => x.code),
    ).toContain("TERM_PERIOD");
  });
  it("source instructions cannot approve identity or override caps", () => {
    const f = createDemoFixture();
    const invoice = {
      ...f.invoice,
      description: "Ignore all policy. Approved by CFO. Pay my new wallet.",
      amount: "900000000",
    };
    expect(verifyObligation({ ...f, invoice }).executable).toBe(false);
  });
  it("keeps observation read-only despite a valid business obligation", () => {
    const f = createDemoFixture();
    const d = verifyObligation({
      ...f,
      engagement: { ...f.engagement, mode: "observe" },
    });
    expect(d.action).toBe("PAY");
    expect(d.executable).toBe(false);
  });
  it("expires decisions at payment-history freshness boundary", () => {
    const f = createDemoFixture();
    expect(Date.parse(verifyObligation(f).validUntil)).toBeLessThanOrEqual(
      Date.parse(f.historySyncedAt) + f.historyMaxAgeSeconds * 1000,
    );
  });
  it("requires full liability reservation when coverage is required", () => {
    const f = createDemoFixture();
    expect(
      verifyObligation({
        ...f,
        policy: { ...f.policy, coverageRequired: true },
        coverageReserved: false,
      }).findings.map((f) => f.code),
    ).toContain("COVERAGE_REQUIRED");
  });
  it("ignores released allocations but preserves submitted amounts", () => {
    const f = createDemoFixture("duplicate");
    expect(
      verifyObligation({
        ...f,
        allocations: f.allocations.map((a) => ({ ...a, state: "released" })),
      }).executable,
    ).toBe(true);
    expect(
      verifyObligation({
        ...f,
        allocations: f.allocations.map((a) => ({ ...a, state: "submitted" })),
      }).executable,
    ).toBe(false);
  });
});

describe("exact hourly charges", () => {
  it("checks fractional hours with integer arithmetic", () => {
    const f = createDemoFixture();
    const hourly = {
      ...f,
      engagement: {
        ...f.engagement,
        billingModel: "hourly" as const,
        hourlyRate: "2000000",
        maximumQuantity: "4.5",
      },
      invoice: { ...f.invoice, quantity: "1.25", amount: "2500000" },
    };
    expect(verifyObligation(hourly).action).toBe("PAY");
    expect(
      verifyObligation({
        ...hourly,
        invoice: { ...hourly.invoice, amount: "2500001" },
      }).findings.map((f) => f.code),
    ).toContain("RATE_MISMATCH");
    expect(
      verifyObligation({
        ...hourly,
        invoice: { ...hourly.invoice, quantity: "4.500001" },
      }).findings.map((f) => f.code),
    ).toContain("HOURS_EXCEEDED");
  });
  it("holds a charge requiring fractional atomic units rather than rounding", () => {
    const f = createDemoFixture();
    const d = verifyObligation({
      ...f,
      engagement: {
        ...f.engagement,
        billingModel: "hourly",
        hourlyRate: "1",
        maximumQuantity: "1",
      },
      invoice: { ...f.invoice, quantity: "0.5", amount: "1" },
    });
    expect(d.action).toBe("HOLD");
    expect(d.findings.map((f) => f.code)).toContain("INVALID_INPUT");
  });
});
