import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Database } from "../../src/lib/server/db";
import type { Actor } from "../../src/lib/server/auth";
import {
  summarizePayables,
  digestWindow,
  saveOperationsPreferences,
  updateOperationsCase,
  accountingClose,
  operationsDesk,
} from "../../src/lib/server/operations";

const org = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const engagementId = "33333333-3333-4333-8333-333333333333";
const caseId = "44444444-4444-4444-8444-444444444444";
const actor: Actor = {
  organizationId: org,
  wallet: `0x${"11".repeat(20)}`,
  role: "owner",
};
const record = (id = invoiceId, amount = "100000000") => ({
  id,
  version: 1,
  kind: "invoice",
  body: {
    amount,
    currency: "USDC",
    reference: "INV",
    vendorId: engagementId,
    engagementId,
    obligationId: "period",
    dueDate: "2026-10-05",
    status: "received",
  },
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});
const payment = (state: string, amount: string, extra = {}) => ({
  id: crypto.randomUUID(),
  invoice_id: invoiceId,
  engagement_id: engagementId,
  state,
  amount,
  permit: { obligationId: "period" },
  source_tx: null,
  destination_tx: null,
  terminal_failure_proof: null,
  ...extra,
});

describe("payable desk arithmetic", () => {
  it("deduplicates obligation intake and keeps uncertain or unproven failed amounts committed", () => {
    const summary = summarizePayables(
      [record(), record(crypto.randomUUID())],
      [
        payment("settled", "30000000"),
        payment("uncertain", "20000000"),
        payment("failed", "10000000"),
        payment("failed", "5000000", {
          terminal_failure_proof: "independent proof",
        }),
      ],
      "2026-10-06T12:00:00Z",
    );
    expect(summary.totals.USDC).toMatchObject({
      invoiced: "100000000",
      settled: "30000000",
      committed: "30000000",
      outstanding: "70000000",
      unallocated: "40000000",
      overdue: "70000000",
    });
    expect(summary.duplicateObligations).toBe(1);
  });
  it("does not convert a USD obligation into USDC settlement or trust an editable paidAmount", () => {
    const r = record();
    r.body.currency = "USD";
    const summary = summarizePayables(
      [r],
      [payment("settled", "30000000")],
      "2026-10-06T12:00:00Z",
    );
    expect(summary.totals.USD.outstanding).toBe("100000000");
    expect(summary.invoices[0].warnings.join(" ")).toMatch(/conversion/i);
    expect(
      summarizePayables(
        [{ ...record(), body: { ...record().body, paidAmount: "100000000" } }],
        [],
        "2026-10-06T12:00:00Z",
      ).totals.USDC.outstanding,
    ).toBe("100000000");
  });
  it("rejects impossible atomic amounts and retains failed network effects even with a failure note", () => {
    expect(() =>
      summarizePayables([record(invoiceId, "1.5")], [], "2026-10-06T00:00:00Z"),
    ).toThrow();
    const summary = summarizePayables(
      [record()],
      [
        payment("failed", "100", {
          terminal_failure_proof: "note",
          source_tx: "0xabc",
        }),
      ],
      "2026-10-06T00:00:00Z",
    );
    expect(summary.totals.USDC.committed).toBe("100");
  });
  it("evaluates quiet hours across midnight in the selected timezone", () => {
    const preferences = {
      notificationsEnabled: true,
      timezone: "Asia/Kolkata",
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      reminderDays: 3,
      escalationHours: 48,
    };
    expect(digestWindow(preferences, "2026-10-06T18:00:00Z").allowed).toBe(
      false,
    );
    expect(digestWindow(preferences, "2026-10-06T04:00:00Z").allowed).toBe(
      true,
    );
    expect(
      digestWindow(
        { ...preferences, notificationsEnabled: false },
        "2026-10-06T04:00:00Z",
      ).allowed,
    ).toBe(false);
  });
});

let pg: PGlite, db: Database;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(await readFile("migrations/001_foundation.sql", "utf8"));
  await pg.exec(await readFile("migrations/002_security_controls.sql", "utf8"));
  await pg.exec(await readFile("migrations/005_notice_delivery.sql", "utf8"));
  db = pg as unknown as Database;
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE");
  await pg.query("INSERT INTO organizations(id,name) VALUES($1,'Desk')", [org]);
  await pg.query("INSERT INTO members VALUES($1,$2,'owner')", [
    org,
    actor.wallet,
  ]);
});
afterAll(async () => pg.close());
it("makes reminders readable and actionable without converting USD or losing fractional units", async () => {
  const usdId = "55555555-5555-4555-8555-555555555555";
  const stuckId = "66666666-6666-4666-8666-666666666666";
  for (const [kind, identifier, body] of [
    ["invoice", invoiceId, record(invoiceId, "1").body],
    [
      "invoice",
      usdId,
      {
        ...record(usdId, "123456789").body,
        currency: "USD",
        obligationId: "usd-period",
        reference: "USD-001",
      },
    ],
    [
      "case",
      caseId,
      {
        invoiceId: usdId,
        title: "Check acceptance",
        reason: "Named approver evidence needed",
        owner: actor.wallet,
        status: "awaiting_evidence",
        priority: "urgent",
        dueAt: "2026-10-05T12:00:00Z",
      },
    ],
  ] as const) {
    await pg.query(
      "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,$2,$3,$4,$5)",
      [org, kind, identifier, JSON.stringify(body), actor.wallet],
    );
  }
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,$5,1,'uncertain','{}')",
    [stuckId, org, invoiceId, engagementId, stuckId],
  );
  const desk = await operationsDesk(db, actor, "2026-10-06T12:00:00Z");
  const usd = desk.digest.notices.find(
    (n) => n.kind === "overdue" && n.id === usdId,
  )!;
  expect(usd.message).toContain("123.456789 USD");
  expect(usd.message).toContain("2026-10-05");
  expect(usd.message).toContain(actor.wallet);
  expect(usd.message).not.toContain("USDC");
  expect(usd).toMatchObject({
    href: `/console?org=${org}&view=invoices&invoice=${usdId}`,
    actionLabel: "Review invoice and evidence",
  });
  const tiny = desk.digest.notices.find(
    (n) => n.kind === "overdue" && n.id === invoiceId,
  )!;
  expect(tiny.message).toContain("0.000001 USDC");
  const exception = desk.digest.notices.find((n) => n.id === caseId)!;
  expect(exception.message).toContain("USD-001");
  expect(exception.message).toContain("2026-10-05T12:00:00Z");
  expect(exception.href).toBe(
    `/console?org=${org}&view=invoices&invoice=${usdId}&case=${caseId}`,
  );
  expect(desk.digest.notices[0]).toMatchObject({
    kind: "stuck_payment",
    id: stuckId,
    href: `/console?org=${org}&view=history&invoice=${invoiceId}&payment=${stuckId}`,
  });
  expect((await pg.query("SELECT state FROM payment_intents")).rows).toEqual([
    { state: "uncertain" },
  ]);
});
it("versions preferences, rejects viewer writes and stale overwrites, and stores no delivery credential", async () => {
  const preferences = {
    notificationsEnabled: false,
    timezone: "UTC",
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    reminderDays: 3,
    escalationHours: 48,
  };
  await expect(
    saveOperationsPreferences(
      db,
      { ...actor, role: "viewer" },
      { expectedVersion: 0, preferences },
    ),
  ).rejects.toThrow();
  const saved = await saveOperationsPreferences(db, actor, {
    expectedVersion: 0,
    preferences,
  });
  expect(saved.version).toBe(1);
  await expect(
    saveOperationsPreferences(db, actor, { expectedVersion: 0, preferences }),
  ).rejects.toThrow(/changed/i);
  await expect(
    saveOperationsPreferences(db, actor, {
      expectedVersion: 1,
      preferences: { ...preferences, timezone: "Invalid/Zone" },
    }),
  ).rejects.toThrow();
  const versions = await pg.query(
    "SELECT * FROM record_versions WHERE organization_id=$1",
    [org],
  );
  expect(versions.rows).toHaveLength(1);
});
it("requires a current workspace assignee and meaningful resolution; resolving only queues reassessment", async () => {
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4),($1,'case',$5,$6,$4)",
    [
      org,
      invoiceId,
      JSON.stringify(record().body),
      actor.wallet,
      caseId,
      JSON.stringify({
        invoiceId,
        vendorId: engagementId,
        title: "Acceptance",
        reason: "Missing acceptance evidence",
        owner: actor.wallet,
        status: "open",
        resolution: "",
      }),
    ],
  );
  const base = {
    expectedVersion: 1,
    owner: actor.wallet,
    status: "resolved",
    priority: "normal",
    resolution: "Delivery evidence reviewed with customer",
  };
  await expect(
    updateOperationsCase(db, actor, caseId, {
      ...base,
      owner: `0x${"22".repeat(20)}`,
    }),
  ).rejects.toThrow(/member/i);
  await expect(
    updateOperationsCase(db, actor, caseId, { ...base, resolution: "ok" }),
  ).rejects.toThrow();
  await updateOperationsCase(db, actor, caseId, base);
  expect(
    (
      await pg.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_intents",
      )
    ).rows[0].count,
  ).toBe(0);
  expect(
    (await pg.query<{ kind: string }>("SELECT kind FROM outbox")).rows[0].kind,
  ).toBe("reassess");
});
it("close reports use settlement time and disclose open operations, with strict date ranges", async () => {
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)",
    [org, invoiceId, JSON.stringify(record().body), actor.wallet],
  );
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,created_at) VALUES($1,$2,$3,$4,$5,20000000,'uncertain','{}','2026-10-01')",
    [crypto.randomUUID(), org, invoiceId, engagementId, crypto.randomUUID()],
  );
  const close = await accountingClose(
    db,
    actor,
    { from: "2026-10-01", through: "2026-10-31" },
    "2026-11-01T00:00:00Z",
  );
  expect(close.complete).toBe(false);
  expect(close.unresolved).toHaveLength(1);
  expect(close.warnings.join(" ")).toMatch(/unresolved/i);
  await expect(
    accountingClose(db, actor, { from: "2026-11-01", through: "2026-10-01" }),
  ).rejects.toThrow();
});
it("never certifies a close with missing settlement ledger evidence and uses event time", async () => {
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)",
    [org, invoiceId, JSON.stringify(record().body), actor.wallet],
  );
  const paymentId = crypto.randomUUID();
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,settled_at) VALUES($1,$2,$3,$4,$5,100,'settled','{}','2026-10-03')",
    [paymentId, org, invoiceId, engagementId, paymentId],
  );
  expect(
    (
      await accountingClose(db, actor, {
        from: "2026-10-01",
        through: "2026-10-31",
      })
    ).complete,
  ).toBe(false);
  const ledgerId = crypto.randomUUID();
  await pg.query(
    "INSERT INTO ledger_events(id,organization_id,payment_id,external_key,body,created_at) VALUES($1,$2,$3,$4,$5,'2026-11-01')",
    [
      ledgerId,
      org,
      paymentId,
      ledgerId,
      JSON.stringify({
        paymentId,
        at: "2026-10-03T00:00:00Z",
        kind: "settlement",
        status: "settled",
      }),
    ],
  );
  const close = await accountingClose(db, actor, {
    from: "2026-10-01",
    through: "2026-10-31",
  });
  expect(close.complete).toBe(true);
  expect(close.ledger).toHaveLength(1);
});
