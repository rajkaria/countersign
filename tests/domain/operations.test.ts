import { describe, it, expect } from "vitest";
import {
  transitionExecution,
  reserveCoverage,
  fileClaim,
  adjudicateClaim,
  settleClaim,
  releaseCoverage,
  coverageCapacity,
  makeLedgerEvent,
  reverseLedgerEvent,
  exportLedger,
  createReceipt,
  verifyReceipt,
  createDemoFixture,
  verifyObligation,
  evaluateCohorts,
} from "../../src/lib/domain";
import type { Execution, CoveragePool } from "../../src/lib/domain";
const operation: Execution = {
  paymentId: "payment-1",
  tenantId: "org",
  state: "prepared",
  sourceChainId: 1,
  destinationChainId: 2,
  recipient: "0x1111111111111111111111111111111111111111",
  asset: "USDC",
  amount: "600",
  permitHash: "a".repeat(64),
  attempt: 0,
  updatedAt: "2026-09-28T00:00:00Z",
};
const pool: CoveragePool = {
  funded: "1000",
  otherLiabilities: "0",
  paidClaims: "0",
  allocations: [],
  claims: [],
};
describe("durable execution identity", () => {
  it("rejects skipping authorization and state transitions", () => {
    expect(() =>
      transitionExecution(operation, {
        type: "submitted",
        providerRequestId: "req",
        at: "2026-09-28T00:00:00Z",
      }),
    ).toThrow();
  });
  it("uncertain operations retain identity and cannot be resubmitted blindly", () => {
    let x = transitionExecution(operation, {
      type: "reserve",
      at: operation.updatedAt,
    });
    x = transitionExecution(x, { type: "authorize", at: x.updatedAt });
    x = transitionExecution(x, {
      type: "submitted",
      providerRequestId: "req",
      at: x.updatedAt,
    });
    x = transitionExecution(x, { type: "uncertain", at: x.updatedAt });
    expect(x.paymentId).toBe("payment-1");
    expect(() =>
      transitionExecution(x, {
        type: "submitted",
        providerRequestId: "new",
        at: x.updatedAt,
      }),
    ).toThrow();
  });
  it("cross-chain source finality is never vendor settlement", () => {
    const source: Execution = {
      ...operation,
      state: "submitted",
      providerRequestId: "req",
    };
    const x = transitionExecution(source, {
      type: "source-confirmed",
      transaction: "0xsource",
      finalized: true,
      at: source.updatedAt,
    });
    expect(x.state).toBe("destination_pending");
    expect(() =>
      transitionExecution(x, {
        type: "destination-confirmed",
        transaction: "0xdest",
        finalized: true,
        chainId: 2,
        recipient: operation.recipient,
        asset: "USDC",
        amount: "599",
        at: x.updatedAt,
      }),
    ).toThrow();
    expect(
      transitionExecution(x, {
        type: "destination-confirmed",
        transaction: "0xdest",
        finalized: true,
        chainId: 2,
        recipient: operation.recipient,
        asset: "USDC",
        amount: "600",
        at: x.updatedAt,
      }).state,
    ).toBe("settled");
  });
});
describe("fully reserved protection", () => {
  it("refuses overcommitted allocations", () => {
    const p = reserveCoverage(pool, {
      id: "c1",
      paymentId: "p1",
      invoiceId: "i1",
      tenantId: "org",
      permitHash: "hash1",
      cap: "600",
      recoveryDestination: "safe",
      termsVersion: 1,
    });
    expect(coverageCapacity(p)).toBe("400");
    expect(() =>
      reserveCoverage(p, {
        id: "c2",
        paymentId: "p2",
        invoiceId: "i2",
        tenantId: "org",
        permitHash: "hash2",
        cap: "600",
        recoveryDestination: "safe",
        termsVersion: 1,
      }),
    ).toThrow();
  });
  it("pending claims survive expiry and payouts cannot be duplicated", () => {
    let p = reserveCoverage(pool, {
      id: "c1",
      paymentId: "p1",
      invoiceId: "i1",
      tenantId: "org",
      permitHash: "hash",
      cap: "600",
      recoveryDestination: "safe",
      termsVersion: 1,
    });
    p = {
      ...p,
      allocations: p.allocations.map((a) => ({
        ...a,
        settledAt: "2026-09-01T00:00:00Z",
        expiresAt: "2026-09-15T00:00:00Z",
      })),
    };
    p = fileClaim(p, {
      id: "claim1",
      coverageId: "c1",
      filedAt: "2026-09-10T00:00:00Z",
      loss: "600",
      priorRecovery: "100",
      evidenceHash: "proof",
    });
    expect(() => releaseCoverage(p, "c1", "2026-10-01T00:00:00Z")).toThrow();
    p = adjudicateClaim(p, "claim1", {
      approved: "500",
      reviewer: "independent",
      evidenceHash: "review",
      at: "2026-09-11T00:00:00Z",
    });
    p = settleClaim(p, "claim1", {
      transaction: "tx",
      amount: "500",
      destination: "safe",
    });
    expect(p.funded).toBe("500");
    expect(() =>
      settleClaim(p, "claim1", {
        transaction: "tx2",
        amount: "500",
        destination: "safe",
      }),
    ).toThrow();
  });
});
describe("append-only ledger and receipts", () => {
  it("rejects unbalanced events and reverses with new identity", () => {
    expect(() =>
      makeLedgerEvent({
        id: "bad",
        tenantId: "org",
        paymentId: "p",
        at: "2026-09-28T00:00:00Z",
        kind: "settlement",
        postings: [
          { account: "cash", asset: "USDC", units: "10", side: "credit" },
        ],
      }),
    ).toThrow();
    const event = makeLedgerEvent({
      id: "e1",
      tenantId: "org",
      paymentId: "p",
      at: "2026-09-28T00:00:00Z",
      kind: "settlement",
      postings: [
        { account: "cash", asset: "USDC", units: "10", side: "credit" },
        { account: "payable", asset: "USDC", units: "10", side: "debit" },
      ],
    });
    expect(
      reverseLedgerEvent(event, "reversal", "2026-09-29T00:00:00Z").reversalOf,
    ).toBe("e1");
    expect(exportLedger([event, event]).count).toBe(1);
  });
  it("detects receipt field tampering and requires a trusted commitment for independent provenance", () => {
    const receipt = createReceipt({
      id: "r1",
      decision: verifyObligation(createDemoFixture()),
      permit: {
        paymentId: "p1",
        recipient: "0x1111111111111111111111111111111111111111",
        amount: "800000000",
        sourceChainId: 1,
        destinationChainId: 1,
        asset: "USDC",
        policyVersion: 1,
        engagementVersion: 1,
        expiresAt: "2026-09-28T10:04:00Z",
      },
      settlement: null,
      evidenceCommitments: ["a".repeat(64)],
      createdAt: "2026-09-28T10:00:00Z",
    });
    expect(verifyReceipt(receipt).integrityValid).toBe(true);
    expect(verifyReceipt(receipt).anchored).toBe(false);
    expect(
      verifyReceipt({ ...receipt, permit: { ...receipt.permit, amount: "1" } })
        .integrityValid,
    ).toBe(false);
    expect(verifyReceipt(receipt, receipt.hash).anchored).toBe(true);
  });
});
it("evaluation separates cohorts and never calls held invoice principal savings", () => {
  const metrics = evaluateCohorts([
    {
      caseId: "c1",
      businessId: "b1",
      vendorId: "v1",
      cohort: "synthetic",
      arm: "rules",
      label: "valid",
      action: "HOLD",
      humanMinutes: 2,
      costUnits: "100",
      incorrectIncrementalUnits: "0",
      settledUnits: "0",
      onTime: false,
      repeatCycle: false,
    },
  ]);
  expect(metrics[0].falseHolds).toBe(1);
  expect(metrics[0].verifiedAvoidedUnits).toBe("0");
  expect(metrics[0].cohort).toBe("synthetic");
});
