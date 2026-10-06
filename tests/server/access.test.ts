import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Database } from "../../src/lib/server/db";
import type { Actor } from "../../src/lib/server/auth";
import {
  listCapabilities,
  revokeCapability,
  paymentDetails,
  removeMember,
  invoiceBalance,
  issueIntakeKey,
  issueVendorLink,
  updateMember,
} from "../../src/lib/server/access";
let pg: PGlite, db: Database;
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const actor: Actor = {
  organizationId: org,
  wallet: `0x${"11".repeat(20)}`,
  role: "owner",
};
beforeAll(async () => {
  pg = new PGlite();
  for (const file of [
    "001_foundation",
    "002_security_controls",
    "004_access_metadata",
  ])
    await pg.exec(await readFile(`migrations/${file}.sql`, "utf8"));
  db = pg as unknown as Database;
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE");
  await pg.query(
    "INSERT INTO organizations(id,name) VALUES($1,'One'),($2,'Two')",
    [org, other],
  );
  await pg.query("INSERT INTO members VALUES($1,$2,'owner')", [
    org,
    actor.wallet,
  ]);
});
afterAll(() => pg.close());
async function addBalancePayment(invoice: string, engagement: string, state: string, amount: string, proof: string | null = null, source: string | null = null) {
  const payment = crypto.randomUUID();
  await pg.query("INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,terminal_failure_proof,source_tx) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [payment, org, invoice, engagement, payment, amount, state, JSON.stringify({ obligationId: "period" }), proof, source]);
}
it("lists public access identifiers, hides hashes and scopes revocation to the tenant", async () => {
  await pg.query(
    "INSERT INTO intake_keys(token_hash,organization_id,label,created_by) VALUES('sensitive-hash',$1,'Forwarder',$2),('other-hash',$3,'Other',$2)",
    [org, actor.wallet, other],
  );
  const entries = await listCapabilities(db, actor, "intake-keys");
  expect(entries).toHaveLength(1);
  expect(JSON.stringify(entries)).not.toContain("sensitive-hash");
  await expect(
    listCapabilities(db, { ...actor, role: "viewer" }, "intake-keys"),
  ).rejects.toThrow();
  const otherId = (
    await pg.query<{ id: string }>(
      "SELECT id FROM intake_keys WHERE organization_id=$1",
      [other],
    )
  ).rows[0].id;
  await expect(
    revokeCapability(db, actor, "intake-keys", otherId),
  ).rejects.toThrow(/workspace/i);
  await revokeCapability(db, actor, "intake-keys", String(entries[0].id));
  expect(
    (await listCapabilities(db, actor, "intake-keys"))[0].revoked_at,
  ).toBeTruthy();
});
it("redacts executor signatures and denies cross-workspace payment details", async () => {
  const paymentId = crypto.randomUUID();
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,'one',100,'prepared',$5)",
    [
      paymentId,
      org,
      crypto.randomUUID(),
      crypto.randomUUID(),
      JSON.stringify({
        verifierSignature: "sensitive-signature",
        decisionId: "decision",
        modulePermit: { amount: "100" },
      }),
    ],
  );
  expect(
    JSON.stringify(await paymentDetails(db, actor, paymentId)),
  ).not.toContain("sensitive-signature");
  await expect(
    paymentDetails(db, { ...actor, organizationId: other }, paymentId),
  ).rejects.toThrow(/workspace/i);
});
it("removes regular members while preserving owners and tenant boundaries", async () => {
  const member = `0x${"22".repeat(20)}`;
  await pg.query(
    "INSERT INTO members VALUES($1,$2,'approver'),($3,$2,'owner')",
    [org, member, other],
  );
  await expect(removeMember(db, actor, actor.wallet)).rejects.toThrow(
    /ownership/i,
  );
  await removeMember(db, actor, member);
  expect(
    (
      await pg.query(
        "SELECT wallet FROM members WHERE organization_id=$1 AND wallet=$2",
        [other, member],
      )
    ).rows,
  ).toHaveLength(1);
});

it("does not discharge a USD invoice with USDC settlement or reservations", async () => {
  const invoice = crypto.randomUUID(), engagement = crypto.randomUUID();
  await pg.query("INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)", [org, invoice, JSON.stringify({ amount: "100000000", currency: "USD", engagementId: engagement, obligationId: "period" }), actor.wallet]);
  await addBalancePayment(invoice, engagement, "settled", "50000000");
  await addBalancePayment(invoice, engagement, "uncertain", "10000000");
  const balance = await invoiceBalance(db, actor, invoice);
  expect(balance).toMatchObject({ invoiced: "100000000", settled: "0", reserved: "0", remaining: "100000000", comparable: false, settlementAsset: "USDC" });
  expect(balance.settlementAllocations).toEqual({ settled: "50000000", reserved: "10000000" });
  expect(balance.warnings.join(" ")).toMatch(/conversion/i);
});

it("keeps unproven and network-effect failures reserved in a comparable USDC balance", async () => {
  const invoice = crypto.randomUUID(), engagement = crypto.randomUUID();
  await pg.query("INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)", [org, invoice, JSON.stringify({ amount: "100", currency: "USDC", engagementId: engagement, obligationId: "period" }), actor.wallet]);
  await addBalancePayment(invoice, engagement, "settled", "40");
  await addBalancePayment(invoice, engagement, "uncertain", "20");
  await addBalancePayment(invoice, engagement, "failed", "10", "reviewed nonexecution", "0xsource");
  await addBalancePayment(invoice, engagement, "failed", "5", "reviewed nonexecution");
  expect(await invoiceBalance(db, actor, invoice)).toMatchObject({ settled: "40", reserved: "30", remaining: "30", comparable: true });
});

it("rechecks stale owner/approver roles before issuing tokens or changing members", async () => {
  const caseId = crypto.randomUUID();
  await pg.query("INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'case',$2,$3,$4)", [org, caseId, JSON.stringify({ vendorId: crypto.randomUUID() }), actor.wallet]);
  await pg.query("UPDATE members SET role='viewer' WHERE organization_id=$1 AND wallet=$2", [org, actor.wallet]);
  await expect(issueIntakeKey(db, actor, "Stale owner")).rejects.toThrow(/role changed/i);
  await expect(issueVendorLink(db, { ...actor, role: "approver" }, caseId)).rejects.toThrow(/role changed/i);
  await expect(updateMember(db, actor, `0x${"33".repeat(20)}`, "operator")).rejects.toThrow(/role changed/i);
  expect((await pg.query("SELECT * FROM intake_keys")).rows).toHaveLength(0);
  expect((await pg.query("SELECT * FROM vendor_links")).rows).toHaveLength(0);
  expect((await pg.query("SELECT * FROM audit_events")).rows).toHaveLength(0);
});

it("prevents one owner from demoting another owner through member updates", async () => {
  const otherOwner = `0x${"44".repeat(20)}`;
  await pg.query("INSERT INTO members VALUES($1,$2,'owner')", [org, otherOwner]);
  await expect(updateMember(db, actor, otherOwner, "viewer")).rejects.toThrow(/ownership/i);
  expect((await pg.query<{ role: string }>("SELECT role FROM members WHERE organization_id=$1 AND wallet=$2", [org, otherOwner])).rows[0].role).toBe("owner");
});
