import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  claimJob,
  completeJob,
  failJob,
  runWorkerOnce,
} from "../../src/lib/server/worker";
import type { Database } from "../../src/lib/server/db";
let pg: PGlite, db: Database;
const org = "11111111-1111-4111-8111-111111111111";
describe("durable fenced outbox leases", () => {
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(await readFile("migrations/001_foundation.sql", "utf8"));
    db = pg as unknown as Database;
    await pg.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
      org,
      "Worker test",
    ]);
  });
  afterAll(() => pg.close());
  it("one worker owns the lease and stale tokens cannot finish work", async () => {
    await pg.query(
      "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'payment.execute','{}','job-1')",
      ["22222222-2222-4222-8222-222222222222", org],
    );
    const first = await claimJob(db);
    expect(first).not.toBeNull();
    expect(await claimJob(db)).toBeNull();
    await pg.exec("UPDATE outbox SET leased_until=now()-interval '1 second'");
    const second = await claimJob(db);
    expect(second?.lease_token).not.toBe(first?.lease_token);
    expect(await completeJob(db, first!)).toBe(false);
    expect(await completeJob(db, second!)).toBe(true);
  });
  it("preserves failed jobs for bounded backoff without changing identity", async () => {
    await pg.query(
      "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'payment.execute','{}','job-2')",
      ["33333333-3333-4333-8333-333333333333", org],
    );
    const job = await claimJob(db);
    await failJob(db, job!, "network failed");
    const row = (
      await pg.query<{
        attempts: number;
        completed_at: null;
        last_error: string;
      }>("SELECT attempts,completed_at,last_error FROM outbox WHERE id=$1", [
        job!.id,
      ])
    ).rows[0];
    expect(row.attempts).toBe(1);
    expect(row.completed_at).toBeNull();
    expect(row.last_error).toBe("network failed");
    expect(await claimJob(db)).toBeNull();
  });
  it("idle worker does not fabricate progress", async () => {
    expect((await runWorkerOnce(db, async () => {})).status).toBe("idle");
  });
});

import {
  processPaymentJob,
  type PaymentWorkerDependencies,
} from "../../src/lib/server/worker";
import { createDemoFixture, verifyObligation } from "../../src/lib/domain";
import { keccak256, stringToHex } from "viem";
import { modulePermitSchema } from "../../src/lib/integrations/module";
it("reconciles one financial effect and atomically closes the invoice after a provider retry", async () => {
  const database = new PGlite();
  await database.exec(await readFile("migrations/001_foundation.sql", "utf8"));
  await database.exec(
    await readFile("migrations/002_security_controls.sql", "utf8"),
  );
  const db = database as unknown as Database;
  const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    paymentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    invoice = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    engagement = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const address = "0x1111111111111111111111111111111111111111";
  await database.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    tenant,
    "Settlement",
  ]);
  await database.query(
    "INSERT INTO records(organization_id,kind,id,version,body,created_by) VALUES($1,'invoice',$2,1,$3,'owner')",
    [
      tenant,
      invoice,
      JSON.stringify({ amount: "800000000", status: "settling" }),
    ],
  );
  const permit = modulePermitSchema.parse({
    schemaVersion: "1",
    chainId: "1",
    safe: address,
    module: address,
    policyEpoch: "1",
    engagementId: "0x" + "11".repeat(32),
    engagementVersion: "1",
    obligationId: "0x" + "22".repeat(32),
    allocationId: "0x" + "33".repeat(32),
    paymentId: keccak256(stringToHex(paymentId)),
    sourceChainId: "1",
    destinationChainId: "1",
    recipient: address,
    token: address,
    amount: "800000000",
    maxFee: "0",
    route: "0x" + "55".repeat(32),
    evidenceCommitment: "0x" + "66".repeat(32),
    expiresAt: "9999999999",
    nonce: "1",
    coverageId: "0x" + "00".repeat(32),
    destinationDomain: "0",
    minFinalityThreshold: "0",
  });
  await database.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,provider_id,source_tx) VALUES($1,$2,$3,$4,'operation',800000000,'uncertain',$5,'provider','0xsource')",
    [
      paymentId,
      tenant,
      invoice,
      engagement,
      JSON.stringify({ modulePermit: permit, verifierSignature: "0x1234" }),
    ],
  );
  await database.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'payment.reconcile',$3,'settle')",
    [
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      tenant,
      JSON.stringify({ paymentId }),
    ],
  );
  let submissions = 0, preflights = 0;
  const deps: PaymentWorkerDependencies = {
    revalidate: async () => verifyObligation(createDemoFixture()),
    preflight: async () => {
      preflights++;
      throw new Error("Deployment evidence is stale or future-dated");
    },
    submit: async () => {
      submissions++;
      return { id: "new", state: "SENT" };
    },
    lookup: async () => null,
    source: async () => ({ finalized: true, crossChain: false }),
  };
  const job = await claimJob(db);
  await processPaymentJob(db, job!, deps);
  await processPaymentJob(db, job!, deps);
  expect(submissions).toBe(0);
  expect(preflights).toBe(0);
  expect(
    (
      await database.query<{ state: string }>(
        "SELECT state FROM payment_intents",
      )
    ).rows[0].state,
  ).toBe("settled");
  expect(
    (
      await database.query<{ body: { status: string; paidAmount: string } }>(
        "SELECT body FROM records",
      )
    ).rows[0].body,
  ).toMatchObject({ status: "paid", paidAmount: "800000000" });
  expect(
    (await database.query("SELECT * FROM ledger_events")).rows.length,
  ).toBe(1);
  expect(
    (await database.query("SELECT * FROM record_versions")).rows.length,
  ).toBe(1);
  await database.close();
});
