import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { type Actor, digest } from "../../src/lib/server/auth";
import { type Database, id } from "../../src/lib/server/db";
import {
  saveRecord,
  getRecord,
  proposeDestinationChange,
  confirmDestinationChange,
  confirmHistoryReconciliation,
  revokeAcceptance,
  lockOrganization,
} from "../../src/lib/server/records";
import { buildCashPlan } from "../../src/lib/server/planning";
import { importInvoices } from "../../src/lib/server/intake";
import { evaluateInvoice, preparePayment } from "../../src/lib/server/review";
let pg: PGlite, db: Database;
const org = "11111111-1111-4111-8111-111111111111";
const owner: Actor = {
  organizationId: org,
  wallet: `0x${"11".repeat(20)}`,
  role: "owner",
};
const approver: Actor = {
  organizationId: org,
  wallet: `0x${"22".repeat(20)}`,
  role: "approver",
};
const operator: Actor = {
  organizationId: org,
  wallet: `0x${"77".repeat(20)}`,
  role: "operator",
};
const destination = `0x${"33".repeat(20)}`,
  changed = `0x${"44".repeat(20)}`;
async function session(actor: Actor, token: string, ago = "0 seconds") {
  await pg.query(
    "INSERT INTO sessions(token_hash,wallet,expires_at,created_at) VALUES($1,$2,now()+interval '1 hour',now()-$3::interval)",
    [digest(token), actor.wallet, ago],
  );
  return { sessionToken: token };
}
async function fixture() {
  const vendor = await saveRecord(db, owner, "vendor", {
    name: "Vendor",
    destination,
    chainId: 1,
    verified: true,
    verificationNote: "Trusted existing contact",
  });
  const safe = await saveRecord(db, owner, "safe", {
    name: "Safe",
    address: `0x${"55".repeat(20)}`,
    chainId: 1,
  });
  await pg.query("UPDATE records SET body=body||$1::jsonb WHERE id=$2", [
    JSON.stringify({
      historySyncedAt: new Date().toISOString(),
      unmatchedTransfers: false,
      token: `0x${"66".repeat(20)}`,
      confirmedBalance: "1000000",
    }),
    safe.id,
  ]);
  const observationId = id(),
    reconciliationId = id();
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'chain_observation',$2,$3,$4),($1,'history_reconciliation',$5,$6,$4)",
    [
      org,
      observationId,
      JSON.stringify({
        safeId: safe.id,
        observedAt: new Date().toISOString(),
        finalizedBlockHash: "0x" + "aa".repeat(32),
        transfers: [],
        balance: "1000000",
      }),
      owner.wallet,
      reconciliationId,
      JSON.stringify({
        observationId,
        finalizedBlockHash: "0x" + "aa".repeat(32),
        sourceDocumentIds: [id()],
      }),
    ],
  );
  const policy = await saveRecord(db, owner, "policy", {
    safeId: safe.id,
    perPayment: "1000",
    rolling24h: "1500",
    totalAllocation: "2000",
    cashFloor: "0",
    protectedAmount: "0",
    feeReserve: "0",
    paused: true,
    coveredOnly: false,
  });
  const terms = {
    vendorId: vendor.id,
    title: "Retainer",
    billing: "retainer",
    amount: "1000",
    ceiling: "10000",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    acceptanceRequired: false,
    acceptors: [owner.wallet],
    partialAllowed: true,
    mode: "prepare",
    approved: true,
    policyId: policy.id,
  };
  const engagement = await saveRecord(db, owner, "engagement", terms);
  const invoiceBody = {
    vendorId: vendor.id,
    engagementId: engagement.id,
    reference: "INV-1",
    amount: "800",
    currency: "USDC",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    dueDate: "2026-10-01",
    destination,
    description: "September",
  };
  const invoice = await saveRecord(db, owner, "invoice", invoiceBody);
  return { vendor, safe, policy, terms, engagement, invoiceBody, invoice };
}
async function payment(
  f: Awaited<ReturnType<typeof fixture>>,
  amount: string,
  state: string,
  extra: Record<string, unknown> = {},
) {
  const paymentId = id(),
    invoiceId = id();
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      paymentId,
      org,
      invoiceId,
      f.engagement.id,
      paymentId,
      amount,
      state,
      JSON.stringify({
        policyId: f.policy.id,
        obligationId: "other-obligation",
        ...extra,
      }),
    ],
  );
  return paymentId;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(await readFile("migrations/001_foundation.sql", "utf8"));
  await pg.exec(await readFile("migrations/002_security_controls.sql", "utf8"));
  db = pg as unknown as Database;
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations,sessions CASCADE");
  await pg.query("INSERT INTO organizations VALUES($1,$2,now())", [
    org,
    "Security fixture",
  ]);
  await pg.query("INSERT INTO members VALUES($1,$2,$3),($1,$4,$5),($1,$6,$7)", [
    org,
    owner.wallet,
    "owner",
    approver.wallet,
    "approver",
    operator.wallet,
    "operator",
  ]);
  process.env.USDC_TOKEN_ADDRESS = `0x${"66".repeat(20)}`;
});
afterAll(() => pg.close());
describe("payment preparation security", () => {
  it("uses remaining global capacity including uncertain allocations and conservative legacy timestamps", async () => {
    const f = await fixture();
    await payment(f, "800", "uncertain");
    await payment(f, "800", "settled");
    const result = await evaluateInvoice(db, owner, f.invoice.id);
    expect(result.input.policy.remainingDelegation).toBe("400");
    expect(result.input.policy.rolling24hRemaining).toBe("0");
    expect(result.decision.action).toBe("HOLD");
  });
  it("keeps pending allocations beyond 24 hours but ages confirmed source expenditure accurately", async () => {
    const f = await fixture();
    const pending = await payment(f, "400", "uncertain"),
      settled = await payment(f, "800", "settled");
    await pg.query(
      "UPDATE payment_intents SET created_at=now()-interval '3 days',updated_at=now()-interval '3 days' WHERE id=$1",
      [pending],
    );
    await pg.query(
      "UPDATE payment_intents SET source_confirmed_at=now()-interval '25 hours',settled_at=now()-interval '1 hour' WHERE id=$1",
      [settled],
    );
    const result = await evaluateInvoice(db, owner, f.invoice.id);
    expect(result.input.policy.remainingDelegation).toBe("800");
    expect(result.input.policy.rolling24hRemaining).toBe("1100");
  });
  it("does not release ambiguous failed payments; requires nonexecution proof and no source transaction", async () => {
    const f = await fixture();
    const failure = await payment(f, "900", "failed");
    expect(
      (await evaluateInvoice(db, owner, f.invoice.id)).input.policy
        .remainingDelegation,
    ).toBe("1100");
    await pg.query(
      "UPDATE payment_intents SET terminal_failure_proof=$1 WHERE id=$2",
      ["confirmed nonexecution", failure],
    );
    expect(
      (await evaluateInvoice(db, owner, f.invoice.id)).input.policy
        .remainingDelegation,
    ).toBe("2000");
    await pg.query("UPDATE payment_intents SET source_tx=$1 WHERE id=$2", [
      "0xsource",
      failure,
    ]);
    expect(
      (await evaluateInvoice(db, owner, f.invoice.id)).input.policy
        .remainingDelegation,
    ).toBe("1100");
  });
  it("preserves intake-approved engagement version when current terms change", async () => {
    const f = await fixture();
    await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, amount: "900" },
      f.engagement.id,
      1,
    );
    const result = await evaluateInvoice(db, owner, f.invoice.id);
    expect(result.input.invoice.engagementVersion).toBe(1);
    expect(
      result.decision.findings.some((x) => x.code === "ENGAGEMENT_MISMATCH"),
    ).toBe(true);
  });
  it("holds shifted overlapping periods and keeps exact-period obligation identity stable", async () => {
    const f = await fixture();
    const second = await saveRecord(db, owner, "invoice", {
      ...f.invoiceBody,
      reference: "changed-id",
      periodStart: "2026-09-02",
    });
    const result = await evaluateInvoice(db, owner, second.id);
    expect(
      result.decision.findings.some((x) => x.code === "OVERLAPPING_OBLIGATION"),
    ).toBe(true);
    const exact = await saveRecord(db, owner, "invoice", {
      ...f.invoiceBody,
      reference: "same-period",
    });
    expect(exact.body.obligationId).toBe(f.invoice.body.obligationId);
  });
  it("binds idempotency to the invoice and excludes only the matching current operation for revalidation", async () => {
    const f = await fixture();
    const prepared = await preparePayment(
      db,
      owner,
      f.invoice.id,
      "prepare-key-001",
    );
    expect(prepared.id).toBeTruthy();
    const other = await saveRecord(db, owner, "invoice", {
      ...f.invoiceBody,
      reference: "oct",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    await expect(
      preparePayment(db, owner, other.id, "prepare-key-001"),
    ).rejects.toThrow(/different invoice/);
    const result = await evaluateInvoice(
      db,
      owner,
      f.invoice.id,
      String(prepared.id),
    );
    expect(result.input.allocations).toHaveLength(0);
    await expect(
      evaluateInvoice(db, owner, other.id, String(prepared.id)),
    ).rejects.toThrow(/current invoice/);
  });
  it("preserves declared invoice currency rather than silently treating USD as USDC", async () => {
    const f = await fixture();
    const invoice = await saveRecord(db, owner, "invoice", {
      ...f.invoiceBody,
      reference: "usd",
      currency: "USD",
    });
    const settledId = await payment(f, "400", "settled");
    const pendingId = await payment(f, "100", "uncertain");
    await pg.query(
      "UPDATE payment_intents SET invoice_id=$1 WHERE id IN ($2,$3)",
      [invoice.id, settledId, pendingId],
    );
    const result = await evaluateInvoice(db, owner, invoice.id);
    expect(result.input.invoice.currency).toBe("USD");
    expect(result.balance).toEqual({
      invoiced: String(invoice.body.amount),
      settled: "0",
      reserved: "0",
      remaining: String(invoice.body.amount),
    });
    expect(
      result.decision.findings.some((x) => x.code === "CURRENCY_MISMATCH"),
    ).toBe(true);
  });
});
describe("destination change authority", () => {
  it("blocks chain-only bypass and requires a fresh server-known session", async () => {
    const f = await fixture();
    await expect(
      saveRecord(
        db,
        owner,
        "vendor",
        { ...f.vendor.body, chainId: 8453 },
        f.vendor.id,
        1,
      ),
    ).rejects.toThrow(/destination-change/);
    await expect(
      proposeDestinationChange(
        db,
        owner,
        {
          vendorId: f.vendor.id,
          expectedVersion: 1,
          destination: changed,
          chainId: 1,
          reason: "Verified using established vendor contact",
        },
        await session(owner, "old", "10 minutes"),
      ),
    ).rejects.toThrow(/Sign in again/);
  });
  it("requires a distinct confirmer and invalidates only safe unsubmitted operations", async () => {
    const f = await fixture();
    const unsubmitted = await payment(f, "100", "prepared"),
      submitted = await payment(f, "100", "submitted");
    await pg.query("UPDATE payment_intents SET provider_id=$1 WHERE id=$2", [
      "circle-operation",
      submitted,
    ]);
    const proof = await session(owner, "owner");
    const proposal = await proposeDestinationChange(
      db,
      owner,
      {
        vendorId: f.vendor.id,
        expectedVersion: 1,
        destination: changed,
        chainId: 8453,
        reason: "Independent confirmation by known vendor contact",
      },
      proof,
    );
    await expect(
      confirmDestinationChange(db, owner, proposal.id, proof),
    ).rejects.toThrow(/different/);
    await confirmDestinationChange(
      db,
      approver,
      proposal.id,
      await session(approver, "approver"),
    );
    const vendor = await getRecord(db, owner, "vendor", f.vendor.id);
    expect(vendor.body.destination).toBe(changed);
    expect(vendor.body.chainId).toBe(8453);
    expect(vendor.body.destinationVersion).toBe(2);
    const { rows } = await pg.query<{ id: string; invalidated_at: unknown }>(
      "SELECT id,invalidated_at FROM payment_intents ORDER BY id",
    );
    expect(rows.find((x) => x.id === unsubmitted)?.invalidated_at).toBeTruthy();
    expect(rows.find((x) => x.id === submitted)?.invalidated_at).toBeNull();
    await expect(
      confirmDestinationChange(
        db,
        approver,
        proposal.id,
        await session(approver, "another"),
      ),
    ).rejects.toThrow(/pending/);
  });
  it("rejects another tenant, role spoofing, expired proposals and stale vendor versions", async () => {
    const f = await fixture();
    const proof = await session(owner, "owner");
    const proposal = await proposeDestinationChange(
      db,
      owner,
      {
        vendorId: f.vendor.id,
        expectedVersion: 1,
        destination: changed,
        chainId: 1,
        reason: "Known-contact confirmation",
      },
      proof,
    );
    await expect(
      confirmDestinationChange(
        db,
        { ...approver, organizationId: id() },
        proposal.id,
        await session(approver, "wrong-tenant"),
      ),
    ).rejects.toThrow();
    await pg.query("UPDATE members SET role='viewer' WHERE wallet=$1", [
      approver.wallet,
    ]);
    await expect(
      confirmDestinationChange(
        db,
        approver,
        proposal.id,
        await session(approver, "demoted"),
      ),
    ).rejects.toThrow(/role/);
    await pg.query(
      "UPDATE destination_changes SET expires_at=now()-interval '1 second' WHERE id=$1",
      [proposal.id],
    );
    await expect(
      confirmDestinationChange(db, owner, proposal.id, proof),
    ).rejects.toThrow(/expired/);
  });
  it("allows only an explicit sole-operator exception with a second fresh login", async () => {
    const f = await fixture();
    await pg.query("DELETE FROM members WHERE wallet=$1", [approver.wallet]);
    const proof = await session(owner, "owner");
    const proposal = await proposeDestinationChange(
      db,
      owner,
      {
        vendorId: f.vendor.id,
        expectedVersion: 1,
        destination: changed,
        chainId: 1,
        reason: "Vendor independently confirmed destination",
        soloExceptionReason:
          "Only eligible person in the workspace; independently called established contact.",
      },
      proof,
    );
    await expect(
      confirmDestinationChange(db, owner, proposal.id, proof),
    ).rejects.toThrow(/Sign in again/);
    await pg.query(
      "UPDATE destination_changes SET created_at=now()-interval '1 second' WHERE id=$1",
      [proposal.id],
    );
    await confirmDestinationChange(
      db,
      owner,
      proposal.id,
      await session(owner, "new-login"),
    );
    const vendor = await getRecord(db, owner, "vendor", f.vendor.id);
    expect(vendor.body.destinationVerification).toBe(
      "solo_reauthenticated_exception",
    );
  });
});

describe("serialized capacity and explicit history evidence", () => {
  it("serializes competing preparations across engagements sharing a policy", async () => {
    const f = await fixture();
    const secondEngagement = await saveRecord(db, owner, "engagement", {
      ...f.terms,
      title: "Second contractor obligation",
    });
    const second = await saveRecord(db, owner, "invoice", {
      ...f.invoiceBody,
      engagementId: secondEngagement.id,
      reference: "SECOND",
    });
    const results = await Promise.allSettled([
      pg.transaction((tx) =>
        preparePayment(
          tx as unknown as Database,
          owner,
          f.invoice.id,
          "parallel-first",
        ),
      ),
      pg.transaction((tx) =>
        preparePayment(
          tx as unknown as Database,
          owner,
          second.id,
          "parallel-second",
        ),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (
        await pg.query<{ amount: string }>(
          "SELECT sum(amount)::text AS amount FROM payment_intents",
        )
      ).rows[0].amount,
    ).toBe("800");
  });
  it("holds unreviewed observed transfers and requires exact complete classification plus tenant documents", async () => {
    const f = await fixture(),
      observationId = id(),
      documentId = id(),
      txHash = `0x${"77".repeat(32)}`;
    await pg.query(
      "DELETE FROM records WHERE kind IN ('chain_observation','history_reconciliation')",
    );
    await pg.query(
      "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'chain_observation',$2,$3,$4)",
      [
        org,
        observationId,
        JSON.stringify({
          safeId: f.safe.id,
          observedAt: new Date().toISOString(),
          finalizedBlockHash: `0x${"ab".repeat(32)}`,
          balance: "1000000",
          transfers: [
            {
              transactionHash: txHash,
              logIndex: 0,
              from: f.safe.body.address,
              to: destination,
              amount: "800",
              block: "100",
            },
          ],
        }),
        owner.wallet,
      ],
    );
    const held = await evaluateInvoice(db, owner, f.invoice.id);
    expect(
      held.decision.findings.some(
        (x) => x.code === "EXTERNAL_PAYMENT_UNMATCHED",
      ),
    ).toBe(true);
    await pg.query(
      "INSERT INTO documents(id,organization_id,filename,mime,byte_length,ciphertext,iv,tag,commitment,created_by) VALUES($1,$2,'statement.txt','text/plain',1,$3,$3,$3,'commitment',$4)",
      [documentId, org, Buffer.from("x"), owner.wallet],
    );
    const proof = await session(owner, "reconcile");
    const base = {
      safeId: f.safe.id,
      observationId,
      sourceDocumentIds: [documentId],
      statement:
        "Reviewed prior statement coverage and every observed outgoing payment.",
    };
    await expect(
      confirmHistoryReconciliation(
        db,
        owner,
        { ...base, transfers: [] },
        proof,
      ),
    ).rejects.toThrow(/every observed/);
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{currency}','\"USD\"'::jsonb) WHERE id=$1",
      [f.invoice.id],
    );
    await expect(
      confirmHistoryReconciliation(
        db,
        owner,
        {
          ...base,
          transfers: [
            {
              transactionHash: txHash,
              logIndex: 0,
              classification: "external_invoice",
              invoiceId: f.invoice.id,
              reason: "Review original destination settlement",
            },
          ],
        },
        proof,
      ),
    ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{currency}','\"USDC\"'::jsonb) WHERE id=$1",
      [f.invoice.id],
    );
    const result = await confirmHistoryReconciliation(
      db,
      owner,
      {
        ...base,
        transfers: [
          {
            transactionHash: txHash,
            logIndex: 0,
            classification: "external_invoice",
            invoiceId: f.invoice.id,
            reason: "Confirmed contractor payment in supplied statement",
          },
        ],
      },
      proof,
    );
    expect(result.createdPayments).toHaveLength(1);
    const paidInvoice = await getRecord(db, owner, "invoice", f.invoice.id);
    expect(paidInvoice.body.paidAmount).toBe("800");
    expect(paidInvoice.body.status).toBe("paid");
    const reviewed = await evaluateInvoice(db, owner, f.invoice.id);
    expect(reviewed.input.unmatchedExternalTransfers).toBe(false);
    expect(
      reviewed.decision.findings.some((x) => x.code === "INVOICE_CAP"),
    ).toBe(true);
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{transfers,0,amount}','\"801\"'::jsonb) WHERE id=$1",
      [observationId],
    );
    await expect(
      confirmHistoryReconciliation(
        db,
        owner,
        {
          ...base,
          transfers: [
            {
              transactionHash: txHash,
              logIndex: 0,
              classification: "external_invoice",
              invoiceId: f.invoice.id,
              reason: "Rechecking the original matched event",
            },
          ],
        },
        proof,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_MATCH" });
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{transfers,0,amount}','\"800\"'::jsonb) WHERE id=$1",
      [observationId],
    );
    const repeat = await confirmHistoryReconciliation(
      db,
      owner,
      {
        ...base,
        transfers: [
          {
            transactionHash: txHash,
            logIndex: 0,
            classification: "external_invoice",
            invoiceId: f.invoice.id,
            reason: "Confirmed contractor payment in supplied statement",
          },
        ],
      },
      proof,
    );
    expect(repeat.createdPayments).toHaveLength(0);
  });
});

describe("complete obligation workflows", () => {
  it("persists hourly terms and verifies exact fractional hours", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      {
        ...f.terms,
        billing: "hourly",
        hourlyRate: "200",
        maximumQuantity: "4.5",
      },
      f.engagement.id,
      1,
    );
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      {
        ...f.invoiceBody,
        engagementVersion: terms.version,
        amount: "250",
        quantity: "1.25",
      },
      f.invoice.id,
      1,
    );
    expect(terms.body.hourlyRate).toBe("200");
    expect(invoice.body.quantity).toBe("1.25");
    const review = await evaluateInvoice(db, owner, invoice.id);
    expect(review.decision.action).toBe("PAY");
    expect(review.input.engagement.maximumQuantity).toBe("4.5");
  });
  it("rejects activating incomplete hourly terms", async () => {
    const f = await fixture();
    await expect(
      saveRecord(
        db,
        owner,
        "engagement",
        { ...f.terms, billing: "hourly" },
        f.engagement.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "HOURLY_TERMS" });
  });
  it("prepares an approved exact partial and revalidates its original amount", async () => {
    const f = await fixture();
    const p = await preparePayment(
      db,
      owner,
      f.invoice.id,
      "partial-operation-001",
      "300",
    );
    expect(p.permit.amount).toBe("300");
    const review = await evaluateInvoice(db, owner, f.invoice.id, p.id);
    expect(review.decision.amount).toBe("300");
    expect(review.decision.action).toBe("PAY");
    expect(review.input.requestedAmount).toBe("300");
    await expect(
      evaluateInvoice(db, owner, f.invoice.id, p.id, "500"),
    ).rejects.toMatchObject({ code: "REVALIDATION_IDENTITY" });
  });
  it("rejects changing a partial amount on an original retry identity", async () => {
    const f = await fixture();
    const p = await preparePayment(
      db,
      owner,
      f.invoice.id,
      "partial-operation-001",
      "300",
    );
    expect(
      (
        await preparePayment(
          db,
          owner,
          f.invoice.id,
          "partial-operation-001",
          "300",
        )
      ).id,
    ).toBe(p.id);
    await expect(
      preparePayment(db, owner, f.invoice.id, "partial-operation-001", "400"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("retains one unresolved payment identity and its full reservation", async () => {
    const f = await fixture();
    const p = await preparePayment(
      db,
      owner,
      f.invoice.id,
      "partial-operation-001",
      "300",
    );
    await expect(
      preparePayment(db, owner, f.invoice.id, "partial-operation-002", "200"),
    ).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
    await pg.query("UPDATE payment_intents SET state='failed' WHERE id=$1", [
      p.id,
    ]);
    await expect(
      preparePayment(db, owner, f.invoice.id, "partial-operation-003", "200"),
    ).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
    const review = await evaluateInvoice(db, owner, f.invoice.id);
    expect(review.balance).toEqual({
      invoiced: "800",
      settled: "0",
      reserved: "300",
      remaining: "500",
    });
  });
  it("enforces the approved minimum installment", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, minimumPartial: "200" },
      f.engagement.id,
      1,
    );
    await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    await expect(
      preparePayment(db, owner, f.invoice.id, "below-minimum-001", "100"),
    ).rejects.toMatchObject({ code: "PAYMENT_HELD" });
  });
  it("prepares the remaining balance after settlement without staling accepted delivery", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, acceptanceRequired: true },
      f.engagement.id,
      1,
    );
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    await saveRecord(db, owner, "acceptance", {
      engagementId: terms.id,
      engagementVersion: terms.version,
      invoiceId: invoice.id,
      statement: "Reviewed and accepted this obligation",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const p = await preparePayment(
      db,
      owner,
      invoice.id,
      "partial-operation-001",
      "300",
    );
    await pg.query(
      "UPDATE payment_intents SET state='settled',settled_at=now(),source_confirmed_at=now() WHERE id=$1",
      [p.id],
    );
    await pg.query(
      'UPDATE records SET version=version+1,body=body||\'{"paidAmount":"300","status":"partially_paid"}\'::jsonb WHERE id=$1',
      [invoice.id],
    );
    const review = await evaluateInvoice(db, owner, invoice.id);
    expect(review.balance).toEqual({
      invoiced: "800",
      settled: "300",
      reserved: "0",
      remaining: "500",
    });
    expect(review.decision.action).toBe("PAY");
    expect(review.decision.amount).toBe("500");
    const remainder = await preparePayment(
      db,
      owner,
      invoice.id,
      "remainder-operation-002",
    );
    expect(remainder.permit.amount).toBe("500");
    expect(remainder.permit.obligationId).toBe(p.permit.obligationId);
  });
  it("requires an explicit reviewed amendment binding and preserves obligation identity", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, amount: "900" },
      f.engagement.id,
      1,
    );
    expect(
      (await evaluateInvoice(db, owner, f.invoice.id)).decision.action,
    ).toBe("HOLD");
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    expect(invoice.body.engagementVersion).toBe(terms.version);
    expect(invoice.body.obligationId).toBe(f.invoice.body.obligationId);
    expect((await evaluateInvoice(db, owner, invoice.id)).decision.action).toBe(
      "PAY",
    );
  });
  it("rejects operator amendment approval and engagement reassignment", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, amount: "900" },
      f.engagement.id,
      1,
    );
    await expect(
      saveRecord(
        db,
        operator,
        "invoice",
        { ...f.invoiceBody, engagementVersion: terms.version },
        f.invoice.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "ROLE" });
    const vendor = await saveRecord(db, owner, "vendor", {
      name: "Other vendor",
      destination,
      chainId: 1,
    });
    await expect(
      saveRecord(
        db,
        owner,
        "engagement",
        { ...f.terms, vendorId: vendor.id },
        terms.id,
        terms.version,
      ),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_IDENTITY" });
  });
  it("uses the approved acceptance age and revocation invalidates prepared authority", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, acceptanceRequired: true, acceptanceMaxAgeSeconds: 60 },
      f.engagement.id,
      1,
    );
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    const acceptance = await saveRecord(db, owner, "acceptance", {
      engagementId: terms.id,
      engagementVersion: terms.version,
      invoiceId: invoice.id,
      statement: "Reviewed and accepted delivery",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(
      (await evaluateInvoice(db, owner, invoice.id)).input.engagement
        .acceptanceMaxAgeSeconds,
    ).toBe(60);
    const prepared = await preparePayment(
      db,
      owner,
      invoice.id,
      "accepted-partial-001",
      "300",
    );
    await revokeAcceptance(
      db,
      owner,
      acceptance.id,
      1,
      "Delivery acceptance was withdrawn by the customer",
    );
    expect((await evaluateInvoice(db, owner, invoice.id)).decision.action).toBe(
      "ASK",
    );
    expect(
      (
        await pg.query<{ invalidated_at: string | null }>(
          "SELECT invalidated_at FROM payment_intents WHERE id=$1",
          [prepared.id],
        )
      ).rows[0].invalidated_at,
    ).toBeTruthy();
    const saved = await getRecord(db, owner, "acceptance", acceptance.id);
    expect(saved.body.statement).toBe("Reviewed and accepted delivery");
    expect(saved.body.revoked).toBe(true);
  });
});

describe("hourly CSV and external installment bookkeeping", () => {
  it("imports reviewed hourly quantities and rejects missing quantities in dry-run", async () => {
    const f = await fixture();
    const engagement = await saveRecord(
      db,
      owner,
      "engagement",
      {
        ...f.terms,
        billing: "hourly",
        hourlyRate: "1000000",
        maximumQuantity: "4.5",
        amount: "4000000",
        ceiling: "10000000",
      },
      f.engagement.id,
      1,
    );
    const csv = `engagement_id,reference,amount_usdc,period_start,period_end,due_date,description,quantity\n${engagement.id},HOUR-1,1.25,2026-10-01,2026-10-31,2026-11-01,October hours,1.25`;
    const imported = await importInvoices(db, owner, csv, false);
    expect(imported.rows[0].status).toBe("imported");
    const invoice = await getRecord(
      db,
      owner,
      "invoice",
      String(imported.rows[0].id),
    );
    expect(invoice.body.quantity).toBe("1.25");
    expect(invoice.body.amount).toBe("1250000");
    const invalid = await importInvoices(
      db,
      owner,
      csv.replace(",1.25\n", ",quantity\n").replace(/,1\.25$/, ","),
      true,
    );
    expect(invalid.rows[0].status).toBe("error");
  });
});

describe("binding freshness", () => {
  it("expires evidence by the owner's configured age even with a future explicit expiry", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, acceptanceRequired: true, acceptanceMaxAgeSeconds: 60 },
      f.engagement.id,
      1,
    );
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    const acceptance = await saveRecord(db, owner, "acceptance", {
      engagementId: terms.id,
      engagementVersion: terms.version,
      invoiceId: invoice.id,
      statement: "Reviewed delivery",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{approvedAt}',to_jsonb($1::text)) WHERE id=$2",
      [new Date(Date.now() - 120000).toISOString(), terms.id],
    );
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{acceptedAt}',to_jsonb($1::text)) WHERE id=$2",
      [new Date(Date.now() - 90000).toISOString(), acceptance.id],
    );
    const reviewed = await evaluateInvoice(db, owner, invoice.id);
    expect(reviewed.decision.action).toBe("ASK");
    expect(reviewed.decision.findings.map((f) => f.code)).toContain(
      "ACCEPTANCE_REQUIRED",
    );
  });
  it("rejects preparing invalid canonical amounts and exhausted balances", async () => {
    const f = await fixture();
    for (const amount of ["0", "-1", "1.1", "801", "0300"])
      await expect(
        preparePayment(
          db,
          owner,
          f.invoice.id,
          `invalid-amount-${amount}`,
          amount,
        ),
      ).rejects.toMatchObject({ code: "PAYMENT_HELD" });
    const p = await preparePayment(
      db,
      owner,
      f.invoice.id,
      "full-operation-001",
    );
    await pg.query(
      "UPDATE payment_intents SET state='settled',settled_at=now(),source_confirmed_at=now() WHERE id=$1",
      [p.id],
    );
    await expect(
      preparePayment(db, owner, f.invoice.id, "exhausted-operation-002"),
    ).rejects.toMatchObject({ code: "PAYMENT_HELD" });
  });
});

describe("reviewed destination rebinding", () => {
  it("binds an unallocated corrected invoice only to the current trusted register", async () => {
    const f = await fixture();
    await pg.query(
      "UPDATE records SET version=2,body=body||$1::jsonb WHERE id=$2",
      [
        JSON.stringify({ destination: changed, destinationVersion: 2 }),
        f.vendor.id,
      ],
    );
    await expect(
      saveRecord(
        db,
        operator,
        "invoice",
        {
          ...f.invoiceBody,
          destination: changed,
          destinationVersion: 2,
          destinationChainId: 1,
        },
        f.invoice.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "ROLE" });
    await expect(
      saveRecord(
        db,
        owner,
        "invoice",
        {
          ...f.invoiceBody,
          destination: changed,
          destinationVersion: 3,
          destinationChainId: 1,
        },
        f.invoice.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "DESTINATION_BINDING" });
    const updated = await saveRecord(
      db,
      owner,
      "invoice",
      {
        ...f.invoiceBody,
        destination: changed,
        destinationVersion: 2,
        destinationChainId: 1,
      },
      f.invoice.id,
      1,
    );
    expect(updated.body.destinationVersion).toBe(2);
    expect((await evaluateInvoice(db, owner, updated.id)).decision.action).toBe(
      "PAY",
    );
  });
});

describe("current transactional authority and cash reservations", () => {
  it("rejects an in-flight actor after membership removal or role downgrade", async () => {
    const f = await fixture();
    await pg.query(
      "DELETE FROM members WHERE organization_id=$1 AND wallet=$2",
      [org, approver.wallet],
    );
    await expect(
      evaluateInvoice(db, approver, f.invoice.id),
    ).rejects.toMatchObject({ code: "ROLE_CHANGED" });
    await pg.query(
      "UPDATE members SET role='viewer' WHERE organization_id=$1 AND wallet=$2",
      [org, owner.wallet],
    );
    await expect(
      preparePayment(db, owner, f.invoice.id, "stale-authority-001"),
    ).rejects.toMatchObject({ code: "ROLE_CHANGED" });
    expect(
      (await pg.query("SELECT id FROM payment_intents")).rows,
    ).toHaveLength(0);
  });
  it("only exempts the explicit read-only worker identities from membership lookup", async () => {
    await fixture();
    await expect(
      lockOrganization(db, {
        ...owner,
        wallet: "system:unknown",
        role: "viewer",
      }),
    ).rejects.toMatchObject({ code: "ROLE_CHANGED" });
    await expect(
      lockOrganization(db, {
        ...owner,
        wallet: "system:standing-delegation",
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "ROLE_CHANGED" });
    await expect(
      lockOrganization(db, {
        ...owner,
        wallet: "system:standing-delegation",
        role: "viewer",
      }),
    ).resolves.toBeUndefined();
    await expect(
      lockOrganization(db, {
        ...owner,
        wallet: "system:chain-observer",
        role: "viewer",
      }),
    ).resolves.toBeUndefined();
  });
  it("keeps unproven failed effects in the shared Safe cash reservation", async () => {
    const f = await fixture();
    await payment(f, "900000", "failed");
    const plan = await buildCashPlan(db, owner, f.policy.id);
    expect(plan.protectedTotal).toBe("900000");
  });
  it("sums protected commitments and the maximum operating floor across policies on one Safe", async () => {
    const f = await fixture();
    await saveRecord(db, owner, "policy", {
      ...f.policy.body,
      perPayment: "100",
      rolling24h: "1000",
      totalAllocation: "1000",
      cashFloor: "500",
      protectedAmount: "10000",
      feeReserve: "100",
    });
    const plan = await buildCashPlan(db, owner, f.policy.id);
    expect(plan.protectedTotal).toBe("10600");
  });
});

describe("material acceptance and terminal-effect boundaries", () => {
  it("requires a fresh acceptance after a material invoice correction", async () => {
    const f = await fixture();
    const terms = await saveRecord(
      db,
      owner,
      "engagement",
      { ...f.terms, acceptanceRequired: true },
      f.engagement.id,
      1,
    );
    const invoice = await saveRecord(
      db,
      owner,
      "invoice",
      { ...f.invoiceBody, engagementVersion: terms.version },
      f.invoice.id,
      1,
    );
    await saveRecord(db, owner, "acceptance", {
      engagementId: terms.id,
      engagementVersion: terms.version,
      invoiceId: invoice.id,
      statement: "Accepted exact reviewed delivery",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect((await evaluateInvoice(db, owner, invoice.id)).decision.action).toBe(
      "PAY",
    );
    const updated = await saveRecord(
      db,
      owner,
      "invoice",
      { ...invoice.body, amount: "750" },
      invoice.id,
      invoice.version,
    );
    expect(updated.body.termsVersion).toBe(3);
    expect(
      (await evaluateInvoice(db, owner, invoice.id)).decision.findings.map(
        (f) => f.code,
      ),
    ).toContain("ACCEPTANCE_REQUIRED");
  });
  it("retains capacity when a failed operation has a destination effect despite a failure proof", async () => {
    const f = await fixture();
    const paymentId = await payment(f, "800", "failed");
    await pg.query(
      "UPDATE payment_intents SET terminal_failure_proof='failure note',destination_tx=$2 WHERE id=$1",
      [paymentId, "0x" + "dd".repeat(32)],
    );
    const reviewed = await evaluateInvoice(db, owner, f.invoice.id);
    expect(reviewed.input.policy.remainingDelegation).toBe("1200");
    expect(reviewed.input.allocations[0].state).toBe("reserved");
  });
  it("checks destination chain as well as address and version during reviewed rebinding", async () => {
    const f = await fixture();
    await expect(
      saveRecord(
        db,
        owner,
        "invoice",
        { ...f.invoiceBody, destinationVersion: 1, destinationChainId: 8453 },
        f.invoice.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "DESTINATION_BINDING" });
  });
});
