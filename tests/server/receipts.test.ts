import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { keccak256, stringToHex } from "viem";
import { buildPaymentReceipt } from "../../src/lib/server/receipts";
import { createDemoFixture } from "../../src/lib/domain/fixtures";
import { verifyObligation } from "../../src/lib/domain/verifier";
import { verifyReceipt } from "../../src/lib/domain/receipt";
import { businessEvidenceCommitment } from "../../src/lib/domain/evidence";
import type { Database } from "../../src/lib/server/db";
import type { Actor } from "../../src/lib/server/auth";
const org = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333",
  invoiceId = "44444444-4444-4444-8444-444444444444",
  engagementId = "55555555-5555-4555-8555-555555555555",
  decisionId = "66666666-6666-4666-8666-666666666666";
const sourceId = "77777777-7777-4777-8777-777777777777";
const actor: Actor = {
  organizationId: org,
  wallet: "0x" + "11".repeat(20),
  role: "viewer",
};
const sourceTx = "0x" + "ab".repeat(32),
  destinationTx = "0x" + "cd".repeat(32),
  zero = "0x" + "00".repeat(32);
let pg: PGlite, db: Database;
function fixture(cross = true) {
  const base = createDemoFixture();
  const destination = {
    ...base.invoice.destination,
    chainId: cross ? 8453 : 5042002,
  };
  const input = {
    ...base,
    tenantId: org,
    engagement: {
      ...base.engagement,
      id: engagementId,
      tenantId: org,
      destinations: [destination],
      source: { ...base.engagement.source, id: sourceId },
    },
    invoice: {
      ...base.invoice,
      id: invoiceId,
      tenantId: org,
      engagementId,
      destination,
      source: { ...base.invoice.source, id: sourceId },
    },
    policy: { ...base.policy, tenantId: org },
    acceptances: base.acceptances.map((a) => ({
      ...a,
      tenantId: org,
      engagementId,
      source: { ...a.source, id: sourceId },
    })),
  };
  const decision = verifyObligation(input);
  const modulePermit = {
    schemaVersion: "1",
    chainId: "5042002",
    safe: "0x" + "22".repeat(20),
    module: "0x" + "33".repeat(20),
    policyEpoch: "1",
    engagementId: keccak256(stringToHex(engagementId)),
    engagementVersion: "1",
    obligationId: keccak256(stringToHex(input.invoice.obligationId)),
    allocationId: zero,
    paymentId: keccak256(stringToHex(paymentId)),
    sourceChainId: "5042002",
    destinationChainId: String(destination.chainId),
    recipient: destination.address,
    token: input.engagement.asset.address,
    amount: decision.amount,
    maxFee: "0",
    route: zero,
    evidenceCommitment: businessEvidenceCommitment(input),
    expiresAt: String(Math.floor(Date.parse(decision.validUntil) / 1000)),
    nonce: "1",
    coverageId: zero,
    destinationDomain: "0",
    minFinalityThreshold: "0",
  };
  const permit = {
    decisionId,
    invoiceVersion: 1,
    engagementVersion: 1,
    policyVersion: 1,
    obligationId: input.invoice.obligationId,
    destination: destination.address,
    amount: decision.amount,
    expiresAt: decision.validUntil,
    modulePermit,
    verifierSignature: "NEVER_EXPORT_SECRET",
  };
  const ledger = {
    id: sourceId,
    tenantId: org,
    paymentId,
    invoiceId,
    engagementId,
    kind: "settlement",
    status: "settled",
    network: String(destination.chainId),
    transaction: cross ? destinationTx : sourceTx,
    at: "2026-09-28T10:00:20.000Z",
    postings: [
      {
        account: "accounts_payable",
        side: "debit",
        asset: modulePermit.token,
        units: decision.amount,
      },
      {
        account: "cash_usdc",
        side: "credit",
        asset: modulePermit.token,
        units: decision.amount,
      },
    ],
  };
  return { decision, input, permit, ledger };
}
async function seed({
  state = "authorized",
  cross = true,
  module = true,
}: { state?: string; cross?: boolean; module?: boolean } = {}) {
  const f = fixture(cross);
  const permit: Record<string, unknown> = { ...f.permit };
  if (!module) delete permit.modulePermit;
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'decision',$2,$3,'operator')",
    [
      org,
      decisionId,
      JSON.stringify({
        decision: {
          ...f.decision,
          reason: "PRIVATE CUSTOMER NOTE",
          nextCheck: "PRIVATE NEXT STEP",
        },
        input: { ...f.input, privateText: "DO NOT DISCLOSE RAW DOCUMENTS" },
      }),
    ],
  );
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,source_tx,destination_tx,source_confirmed_at,settled_at) VALUES($1,$2,$3,$4,'stable-key',$5,$6,$7,$8,$9,$10,$11)",
    [
      paymentId,
      org,
      invoiceId,
      engagementId,
      f.decision.amount,
      state,
      JSON.stringify(permit),
      ["settled", "destination_pending"].includes(state) ? sourceTx : null,
      state === "settled" && cross ? destinationTx : null,
      ["settled", "destination_pending"].includes(state)
        ? "2026-09-28T10:00:10Z"
        : null,
      state === "settled" ? "2026-09-28T10:00:21Z" : null,
    ],
  );
  if (state === "settled")
    await pg.query(
      "INSERT INTO ledger_events(id,organization_id,payment_id,external_key,body) VALUES($1,$2,$3,$4,$5)",
      [
        sourceId,
        org,
        paymentId,
        `settlement:${paymentId}`,
        JSON.stringify(f.ledger),
      ],
    );
  return f;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(await readFile("migrations/001_foundation.sql", "utf8"));
  await pg.exec(await readFile("migrations/002_security_controls.sql", "utf8"));
  db = {
    query: async <T>(sql: string, values?: unknown[]) => {
      const result = await pg.query<T>(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows };
    },
  } as Database;
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE");
  await pg.query(
    "INSERT INTO organizations(id,name) VALUES($1,'One'),($2,'Two')",
    [org, other],
  );
});
describe("portable receipt builder", () => {
  it("exports only persisted fields and excludes raw input, private narrative and signing credentials", async () => {
    await seed();
    const receipt = await buildPaymentReceipt(db, actor, paymentId);
    expect(verifyReceipt(receipt).integrityValid).toBe(true);
    expect(receipt.settlement).toBeNull();
    expect(receipt.execution).toBeDefined();
    const raw = JSON.stringify(receipt);
    expect(raw).not.toMatch(/PRIVATE|DO NOT DISCLOSE|NEVER_EXPORT/);
    expect(receipt.evidenceCommitments).toEqual([
      receipt.execution!.permit.evidenceCommitment,
    ]);
    expect(await buildPaymentReceipt(db, actor, paymentId)).toEqual(receipt);
  });
  it("exports an unsigned prepared proposal without inventing execution or settlement", async () => {
    await seed({ state: "prepared", module: false });
    const receipt = await buildPaymentReceipt(db, actor, paymentId);
    expect(receipt.execution).toBeUndefined();
    expect(receipt.settlement).toBeNull();
    expect(receipt.evidenceCommitments).toEqual([]);
  });
  it("never treats source-only cross-chain confirmation as destination settlement", async () => {
    await seed({ state: "destination_pending" });
    const receipt = await buildPaymentReceipt(db, actor, paymentId);
    expect(receipt.settlement).toBeNull();
  });
  it("exports verified persisted cross-chain destination and exact execution permit", async () => {
    await seed({ state: "settled" });
    const receipt = await buildPaymentReceipt(db, actor, paymentId);
    expect(receipt.settlement?.transaction).toBe(destinationTx);
    expect(receipt.settlement?.chainId).toBe(8453);
    expect(verifyReceipt(receipt).integrityValid).toBe(true);
  });
  it("uses a recorded source transaction for settled same-chain transfers", async () => {
    await seed({ state: "settled", cross: false });
    const receipt = await buildPaymentReceipt(db, actor, paymentId);
    expect(receipt.settlement?.transaction).toBe(sourceTx);
    expect(receipt.settlement?.chainId).toBe(5042002);
  });
  it("denies another organization and malformed IDs", async () => {
    await seed();
    await expect(
      buildPaymentReceipt(db, { ...actor, organizationId: other }, paymentId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      buildPaymentReceipt(db, actor, "not-an-id"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("will not join a decision from another organization", async () => {
    await seed();
    await pg.query("UPDATE records SET organization_id=$1 WHERE id=$2", [
      other,
      decisionId,
    ]);
    await expect(
      buildPaymentReceipt(db, actor, paymentId),
    ).rejects.toMatchObject({ code: "RECEIPT_BINDING" });
  });
  it.each(["destination_tx", "source_tx", "settled_at", "source_confirmed_at"])(
    "refuses settled receipts missing %s",
    async (field) => {
      await seed({ state: "settled" });
      await pg.exec(`UPDATE payment_intents SET ${field}=NULL`);
      await expect(
        buildPaymentReceipt(db, actor, paymentId),
      ).rejects.toMatchObject({ code: "RECEIPT_BINDING" });
    },
  );
  it("rejects missing or mismatched settlement ledger and tampered amount", async () => {
    await seed({ state: "settled" });
    await pg.exec("DELETE FROM ledger_events");
    await expect(
      buildPaymentReceipt(db, actor, paymentId),
    ).rejects.toMatchObject({ code: "RECEIPT_BINDING" });
  });
  it("rejects an execution permit swapped to another recipient", async () => {
    await seed();
    await pg.exec(
      `UPDATE payment_intents SET permit=jsonb_set(permit,'{modulePermit,recipient}','"0x${"99".repeat(20)}"')`,
    );
    await expect(
      buildPaymentReceipt(db, actor, paymentId),
    ).rejects.toMatchObject({ code: "RECEIPT_BINDING" });
  });
  it("rejects tampered persisted decision and execution evidence binding", async () => {
    await seed();
    await pg.exec(
      `UPDATE payment_intents SET permit=jsonb_set(permit,'{modulePermit,evidenceCommitment}','"${zero}"')`,
    );
    await expect(
      buildPaymentReceipt(db, actor, paymentId),
    ).rejects.toMatchObject({ code: "RECEIPT_BINDING" });
  });
});
