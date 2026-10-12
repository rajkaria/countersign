import { verifyReceipt } from "../../src/lib/domain/receipt";
import { describe, expect, it } from "vitest";
import {
  INITIAL_INVOICES,
  parseInvoiceInput,
  resolveAcceptance,
  toCsv,
  planPayments,
  runRecoveryScenario,
  createDemoReceipt,
  getDemoReview,
} from "../../src/lib/demo";
describe("isolated review sandbox", () => {
  it("rejects invalid monetary precision and empty vendors", () => {
    expect(() =>
      parseInvoiceInput({
        vendor: "",
        reference: "ABC",
        amount: "5",
        due: "2026-10-01",
      }),
    ).toThrow();
    expect(() =>
      parseInvoiceInput({
        vendor: "Acme",
        reference: "ABC",
        amount: "5.001",
        due: "2026-10-01",
      }),
    ).toThrow();
  });
  it("keeps invoices held unless their specific acceptance issue can be resolved", () => {
    const mismatch = INITIAL_INVOICES.find((i) => i.issue === "destination")!;
    expect(() => resolveAcceptance(mismatch)).toThrow();
    const awaiting = INITIAL_INVOICES.find((i) => i.issue === "acceptance")!;
    const resolved = resolveAcceptance(awaiting);
    expect(resolved.status).toBe("ready");
    expect(resolved.version).toBe(awaiting.version + 1);
    expect(resolved.history).toEqual([
      ...awaiting.history,
      "Sample operator accepted delivery",
      "Decision revised: held → ready",
    ]);
  });
  it("never plans more than confirmed available funds", () => {
    const plan = planPayments(INITIAL_INVOICES, 100000);
    expect(
      plan.items
        .filter((i) => i.reserved)
        .reduce((sum, i) => sum + Number(i.amount), 0),
    ).toBeLessThanOrEqual(1000000000);
  });
  it("does not invent approved terms or convert the currency of a new sample", () => {
    const invoice = parseInvoiceInput({
      vendor: "Acme",
      reference: "NEW-27",
      amount: "25.50",
      due: "2027-03-19",
    });
    expect(invoice.currency).toBe("USD");
    expect(invoice.issue).toBe("source");
    expect(() => resolveAcceptance(invoice)).toThrow();
    expect(() => createDemoReceipt(invoice)).toThrow(/source/i);
  });
  it("reserves future eligible payments using the production scheduling bounds", () => {
    const plan = planPayments(INITIAL_INVOICES, 500000);
    expect(plan.expectedInflowsSpendable).toBe(false);
    expect(plan.items.find((item) => item.id === "inv-081")).toMatchObject({
      action: "SCHEDULE",
      reserved: true,
      executionAt: "2026-10-02T23:59:59.000Z",
    });
    expect(plan.items.find((item) => item.id === "inv-229")).toMatchObject({
      action: "SCHEDULE",
      reserved: false,
      shortfall: "1550000000",
    });
    expect(plan.items.find((item) => item.id === "inv-1042")).toMatchObject({
      action: "HOLD",
      reserved: false,
    });
    expect(plan.remainingCash).toBe("8200000000");
  });
  it("rejects invalid demo cash rather than rounding it into payment capacity", () => {
    expect(() => planPayments(INITIAL_INVOICES, 0.1)).toThrow();
    expect(() => planPayments(INITIAL_INVOICES, -1)).toThrow();
  });
  it("derives eligibility from verification rather than a displayed ready status", () => {
    const invoice = {
      ...INITIAL_INVOICES.find((item) => item.issue === "destination")!,
      status: "ready" as const,
    };
    const plan = planPayments([invoice]);
    expect(plan.items[0]).toMatchObject({
      action: "HOLD",
      reserved: false,
      eligible: false,
    });
  });
  it("escapes spreadsheet formulas and commas", () => {
    expect(toCsv([{ ...INITIAL_INVOICES[0], vendor: "=SUM(1,2)" }])).toContain(
      '"\'=SUM(1,2)"',
    );
  });
});

describe("inspectable synthetic review", () => {
  it("shows actual verification with a bounded recorded proposal and cited source text", () => {
    const invoice = INITIAL_INVOICES.find((i) => i.issue === "acceptance")!;
    const review = getDemoReview(invoice);
    expect(review.decision.action).toBe("ASK");
    expect(review.decision.executable).toBe(false);
    expect(
      review.sources.some((source) => source.content.includes("activity")),
    ).toBe(true);
    expect(review.modelFixture?.proposal.action).toBe("ASK");
    expect(review.modelFixture?.modelExecuted).toBe(false);
    expect(
      review.modelFixture?.proposal.sourceIds.every((id) =>
        review.sources.some((source) => source.id === id),
      ),
    ).toBe(true);
    expect(review.modelFixture?.proposal.missing.length).toBeGreaterThan(0);
    const changed = getDemoReview(resolveAcceptance(invoice));
    expect(changed.decision.invoiceVersion).toBe(2);
    expect(changed.decision.action).toBe("PAY");
    expect(changed.decision.executable).toBe(false);
    expect(changed.modelFixture?.proposal.missing).toEqual([]);
  });
  it("keeps unverified custom input held without an invented model proposal", () => {
    const invoice = parseInvoiceInput({
      vendor: "Acme",
      reference: "NEW-27",
      amount: "25.50",
      due: "2027-03-19",
    });
    const review = getDemoReview(invoice);
    expect(review.decision.action).toBe("HOLD");
    expect(review.modelFixture).toBeNull();
    expect(review.approvedTerms).toBe(false);
    expect(review.sources).toHaveLength(1);
  });
});

describe("browser recovery fixtures use actual domain logic", () => {
  it("rejects a new broadcast when the original outcome is uncertain", () =>
    expect(runRecoveryScenario("timeout")).toContain(
      "Repeat submission rejected",
    ));
  it("keeps source-only routes unsettled", () =>
    expect(runRecoveryScenario("bridge")).toContain(
      "State: destination_pending",
    ));
  it("rejects duplicate obligation and changed recipients", () => {
    expect(runRecoveryScenario("duplicate")).toContain("OBLIGATION_CAP");
    expect(runRecoveryScenario("malicious")).toContain("DESTINATION_CHANGED");
  });
  it("requires current acceptance and funded reserve", () => {
    expect(runRecoveryScenario("stale")).toContain("ACCEPTANCE_REQUIRED");
    expect(runRecoveryScenario("reserve")).toContain(
      "Insufficient reserved protection capacity",
    );
  });
});

it("exports verifiable production-schema receipts without inventing settlement", () => {
  for (const invoice of INITIAL_INVOICES) {
    const receipt = createDemoReceipt(invoice);
    expect(verifyReceipt(receipt).integrityValid).toBe(true);
    expect(receipt.settlement).toBeNull();
    expect(receipt.id).toMatch(/^synthetic-/);
    expect(receipt.decision.executable).toBe(false);
    expect(receipt.permit.destinationChainId).toBe(5042002);
    expect(receipt.permit.recipient).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  }
});
