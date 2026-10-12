import { describe, it, expect } from "vitest";
import {
  consoleTarget,
  resolveConsoleTarget,
  hydrateConsoleTarget,
} from "../../src/components/console/navigation";
const org = "11111111-1111-4111-8111-111111111111";
const invoice = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const payment = "44444444-4444-4444-8444-444444444444";
describe("scoped console review links", () => {
  it("hydrates retained recovery identities outside the bounded activity snapshot", async () => {
    const target = { org, view: "activity", invoice, payment };
    const context = await hydrateConsoleTarget(
      target,
      { records: [], payments: [] },
      async (kind, id) => ({ kind, id, version: 1, body: {} }),
      async (id) => ({
        id,
        invoice_id: invoice,
        amount: "1",
        state: "uncertain",
      }),
    );
    expect(
      resolveConsoleTarget(target, context.records, context.payments).payment
        ?.id,
    ).toBe(payment);
  });
  it("rejects hydrated responses with mismatched identities or obligations", async () => {
    const target = { org, view: "activity", invoice, payment };
    await expect(
      hydrateConsoleTarget(
        target,
        { records: [], payments: [] },
        async (kind) => ({ kind, id: org, version: 1, body: {} }),
        async (id) => ({
          id,
          invoice_id: invoice,
          amount: "1",
          state: "uncertain",
        }),
      ),
    ).rejects.toThrow(/identity/);
    await expect(
      hydrateConsoleTarget(
        target,
        { records: [], payments: [] },
        async (kind, id) => ({ kind, id, version: 1, body: {} }),
        async (id) => ({
          id,
          invoice_id: org,
          amount: "1",
          state: "uncertain",
        }),
      ),
    ).rejects.toThrow(/does not belong/);
  });
  it("resolves a payment link only within an existing authenticated membership", () => {
    const target = consoleTarget(
      `?org=${org}&view=history&invoice=${invoice}&payment=${payment}`,
      [{ id: org }],
    )!;
    expect(target.view).toBe("activity");
    expect(
      resolveConsoleTarget(
        target,
        [{ id: invoice, kind: "invoice", version: 2, body: {} }],
        [{ id: payment, invoice_id: invoice, amount: "1", state: "uncertain" }],
      ).payment?.id,
    ).toBe(payment);
  });
  it("rejects inaccessible tenants, duplicate query fields and unsupported destinations", () => {
    for (const query of [
      `?org=${org}`,
      `?org=${org}&org=${org}`,
      `?org=${org}&invoice=javascript:alert(1)`,
      `?org=${org}&view=authorize`,
    ])
      expect(() => consoleTarget(query, [])).toThrow();
    expect(() =>
      consoleTarget(`?org=${org}&org=${org}`, [{ id: org }]),
    ).toThrow(/conflicting/);
    expect(consoleTarget("", [{ id: org }])).toBeNull();
  });
  it("never substitutes a record from the wrong kind or a mismatched invoice", () => {
    const target = { org, view: "invoices", invoice, caseId };
    expect(() =>
      resolveConsoleTarget(
        target,
        [{ id: invoice, kind: "vendor", version: 1, body: {} }],
        [],
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      resolveConsoleTarget(
        target,
        [
          { id: invoice, kind: "invoice", version: 1, body: {} },
          { id: caseId, kind: "case", version: 1, body: { invoiceId: org } },
        ],
        [],
      ),
    ).toThrow(/does not belong/);
  });
});
