import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { accountingClose, closeCsv } from "../../src/lib/server/operations";
import type { Database } from "../../src/lib/server/db";

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  for (const migration of ["001_foundation", "002_security_controls"]) await pg.exec(await readFile(`migrations/${migration}.sql`, "utf8"));
});
afterAll(async () => { await pg.close(); });

it("does not mark a close complete when a settled payment has no attributable recognition date", async () => {
  const org = crypto.randomUUID(), invoice = crypto.randomUUID(), payment = crypto.randomUUID(), engagement = crypto.randomUUID(), ledger = crypto.randomUUID();
  await pg.query("INSERT INTO organizations(id,name) VALUES($1,'Close review fixture')", [org]);
  await pg.query("INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,'fixture')", [org, invoice, { reference: "FIXTURE", currency: "USDC", amount: "100", vendorId: crypto.randomUUID() }]);
  await pg.query("INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,created_at,settled_at) VALUES($1,$2,$3,$4,$5,100,'settled','{}','2026-10-01',NULL)", [payment, org, invoice, engagement, payment]);
  await pg.query("INSERT INTO ledger_events(id,organization_id,payment_id,external_key,body) VALUES($1,$2,$3,$4,$5)", [ledger, org, payment, ledger, { at: "2026-10-03T00:00:00Z", kind: "settlement", status: "settled", paymentId: payment }]);
  const close = await accountingClose(pg as unknown as Database, { organizationId: org, role: "viewer", wallet: "fixture" }, { from: "2026-10-01", through: "2026-10-31" });
  expect(close.complete).toBe(false);
  expect(close.warnings.join(" ")).toMatch(/settlement.*time|recognition.*time/i);
  expect(close.unattributedSettlements.map((row) => row.id)).toEqual([payment]);
  expect(closeCsv(close)).toContain('"unattributed_settlement"');
});
