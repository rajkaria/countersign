import { it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { overrideInvoice } from "../../src/lib/server/overrides";
import { digest, type Actor } from "../../src/lib/server/auth";
const org = "11111111-1111-4111-8111-111111111111",
  invoice = "22222222-2222-4222-8222-222222222222";
const actor: Actor = {
  organizationId: org,
  wallet: "0x1111111111111111111111111111111111111111",
  role: "owner",
};
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  for (const file of ["001_foundation.sql", "002_security_controls.sql"])
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  await db.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    org,
    "Test",
  ]);
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)",
    [
      org,
      invoice,
      JSON.stringify({
        amount: "100",
        status: "received",
        destination: "original",
      }),
      actor.wallet,
    ],
  );
});
afterAll(async () => db.close());
it("only an owner may override; scope and invoice version are mandatory", async () => {
  await expect(
    overrideInvoice(
      db,
      { ...actor, role: "operator" },
      {
        invoiceId: invoice,
        expectedVersion: 1,
        action: "hold",
        reason: "Disputed delivery",
      },
      "",
    ),
  ).rejects.toThrow();
  await expect(
    overrideInvoice(
      db,
      { ...actor, organizationId: crypto.randomUUID() },
      {
        invoiceId: invoice,
        expectedVersion: 1,
        action: "hold",
        reason: "Disputed delivery",
      },
      "",
    ),
  ).rejects.toThrow();
  await expect(
    overrideInvoice(
      db,
      actor,
      {
        invoiceId: invoice,
        expectedVersion: 9,
        action: "hold",
        reason: "Disputed delivery",
      },
      "",
    ),
  ).rejects.toThrow();
});
it("records a narrow hold and cannot force payment or widen terms", async () => {
  const result = await overrideInvoice(
    db,
    actor,
    {
      invoiceId: invoice,
      expectedVersion: 1,
      action: "hold",
      reason: "Customer disputes completion",
    },
    "",
  );
  expect(result.coverageConsequence).toContain("does not add");
  const r = (
    await db.query<{
      body: { amount: string; destination: string; status: string };
      version: number;
    }>("SELECT body,version FROM records WHERE id=$1", [invoice])
  ).rows[0];
  expect(r.body).toMatchObject({
    amount: "100",
    destination: "original",
    status: "disputed",
  });
  expect(r.version).toBe(2);
  await expect(
    overrideInvoice(
      db,
      actor,
      {
        invoiceId: invoice,
        expectedVersion: 2,
        action: "pay",
        reason: "Bypass verification",
      },
      "",
    ),
  ).rejects.toThrow();
});
it("clearing requires fresh authentication and restores review only", async () => {
  const input = {
    invoiceId: invoice,
    expectedVersion: 2,
    action: "clear_hold",
    reason: "Customer evidence reviewed",
  };
  await expect(overrideInvoice(db, actor, input, "")).rejects.toThrow(
    "Sign in",
  );
  await db.query(
    "INSERT INTO sessions(token_hash,wallet,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [digest("fresh"), actor.wallet],
  );
  await overrideInvoice(db, actor, input, "fresh");
  const r = (
    await db.query<{ body: { status: string; manualHold: boolean } }>(
      "SELECT body FROM records WHERE id=$1",
      [invoice],
    )
  ).rows[0];
  expect(r.body.status).toBe("received");
  expect(r.body.manualHold).toBe(false);
});
