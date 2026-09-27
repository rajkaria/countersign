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
      plan.filter((i) => i.funded).reduce((sum, i) => sum + i.amountCents, 0),
    ).toBeLessThanOrEqual(100000);
  });
  it("escapes spreadsheet formulas and commas", () => {
    expect(toCsv([{ ...INITIAL_INVOICES[0], vendor: "=SUM(1,2)" }])).toContain(
      '"\'=SUM(1,2)"',
    );
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
  }
});
