import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  runStandingAutomation,
  type AutomationDependencies,
} from "../../src/lib/server/automation";
import { createDemoFixture, verifyObligation } from "../../src/lib/domain";
import type { Database } from "../../src/lib/server/db";
const org = "11111111-1111-4111-8111-111111111111",
  engagement = "22222222-2222-4222-8222-222222222222",
  policy = "33333333-3333-4333-8333-333333333333",
  safe = "44444444-4444-4444-8444-444444444444",
  invoice = "55555555-5555-4555-8555-555555555555",
  payment = "66666666-6666-4666-8666-666666666666",
  wallet = "0x1111111111111111111111111111111111111111",
  now = "2026-09-28T10:00:00Z";
let pg: PGlite,
  db: Database,
  prepared: string[],
  authorized: string[],
  actors: string[];
let deps: AutomationDependencies;
async function record(kind: string, id: string, body: Record<string, unknown>) {
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,$2,$3,$4,$5)",
    [org, kind, id, JSON.stringify(body), wallet],
  );
}
async function run() {
  return pg.transaction(async (tx) =>
    runStandingAutomation(
      tx as unknown as Database,
      { organizationId: org, now },
      deps,
    ),
  );
}
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(await readFile("migrations/001_foundation.sql", "utf8"));
  await pg.exec(await readFile("migrations/002_security_controls.sql", "utf8"));
  db = pg as unknown as Database;
  prepared = [];
  authorized = [];
  actors = [];
  await pg.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    org,
    "Automatic team",
  ]);
  await pg.query("INSERT INTO members VALUES($1,$2,'owner')", [org, wallet]);
  await record("engagement", engagement, {
    approved: true,
    approvedBy: wallet,
    mode: "delegate",
    policyId: policy,
  });
  await record("policy", policy, {
    safeId: safe,
    cashFloor: "500000000",
    feeReserve: "0",
    protectedAmount: "1500000000",
  });
  await record("invoice", invoice, {
    engagementId: engagement,
    status: "received",
    amount: "800000000",
    dueDate: "2026-09-28",
  });
  await record("chain_observation", "77777777-7777-4777-8777-777777777777", {
    safeId: safe,
    observedAt: now,
    balance: "3000000000",
  });
  deps = {
    evaluate: async (_db, actor, id) => {
      actors.push(actor.wallet);
      const fixture = createDemoFixture();
      return {
        id: "decision",
        input: fixture,
        decision: { ...verifyObligation(fixture), invoiceId: id },
      };
    },
    prepare: async (_db, _actor, id) => {
      prepared.push(id);
      return { id: payment, state: "prepared" };
    },
    authorize: async (_db, _actor, id) => {
      authorized.push(id);
      return { id, state: "authorized" };
    },
    assertReady: async () => {},
  };
});
afterEach(() => pg.close());
describe("bounded standing delegation orchestration", () => {
  it("uses stored current approving owner, pays due eligible obligations after protected-cash planning", async () => {
    const result = await run();
    expect(prepared).toEqual([invoice]);
    expect(authorized).toEqual([payment]);
    expect(actors).toEqual([wallet]);
    expect(result.outcomes[0].action).toBe("AUTHORIZED");
  });
  it("never fabricates authority when original approver leaves", async () => {
    await pg.query("UPDATE members SET role='viewer'");
    const result = await run();
    expect(actors).toEqual([]);
    expect(authorized).toEqual([]);
    expect(result.outcomes[0].action).toBe("ASK");
  });
  it("does not authorize a jointly unaffordable second invoice or an invoice before its due date", async () => {
    const next = "88888888-8888-4888-8888-888888888888";
    await record("invoice", next, {
      engagementId: engagement,
      status: "received",
      amount: "800000000",
      dueDate: "2026-09-29",
    });
    const result = await run();
    expect(authorized).toHaveLength(1);
    expect(result.outcomes.find((o) => o.invoiceId === next)?.action).toBe(
      "SCHEDULE",
    );
  });
  it("preserves uncertain payment identity and reservation across evidence reassessment", async () => {
    await pg.query(
      "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,'existing',800000000,'uncertain',$5)",
      [payment, org, invoice, engagement, JSON.stringify({ policyId: policy })],
    );
    const result = await run();
    expect(result.outcomes[0].action).toBe("RECOVERY_REQUIRED");
    expect(prepared).toEqual([]);
    expect(authorized).toEqual([]);
  });
  it("reuses a current prepared operation and retains a covered allocation hold", async () => {
    await pg.query(
      "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,'existing',800000000,'prepared',$5)",
      [payment, org, invoice, engagement, JSON.stringify({ policyId: policy })],
    );
    deps.authorize = async (_db, _actor, id) => {
      authorized.push(id);
      return { id, state: "prepared", awaitingCoverage: true };
    };
    const result = await run();
    expect(prepared).toEqual([]);
    expect(authorized).toEqual([payment]);
    expect(result.outcomes[0].action).toBe("AWAITING_COVERAGE");
  });
  it("fails closed on deployment gates and stale balances; notifications remain off", async () => {
    deps.assertReady = async () => {
      throw new Error("Circle proof missing");
    };
    expect((await run()).outcomes[0].action).toBe("HOLD");
    expect(authorized).toEqual([]);
    await pg.query(
      "UPDATE records SET body=jsonb_set(body,'{observedAt}','\"2026-09-27T00:00:00Z\"') WHERE kind='chain_observation'",
    );
    expect((await run()).outcomes[0].action).toBe("HOLD");
    expect(
      (await db.query("SELECT id FROM outbox WHERE kind='notify'")).rows,
    ).toEqual([]);
  });
  it("records an authorization failure without losing other invoice decisions", async () => {
    deps.authorize = async () => {
      throw new Error("Reserve unavailable");
    };
    const result = await run();
    expect(result.outcomes[0].reason).toBe("Reserve unavailable");
    expect(
      (await db.query("SELECT id FROM records WHERE kind='automation_outcome'"))
        .rows,
    ).toHaveLength(1);
  });
});

import { persistStandingObservation } from "../../src/lib/server/automation";
import {
  persistCoveredDecision,
  businessEvidenceCommitment,
} from "../../src/lib/server/authorization";
it("extends a continuous finalized owner baseline but stops for unknown external transfers", async () => {
  await record("safe", safe, { address: wallet, chainId: 5042002 });
  const hash = "0x" + "11".repeat(32),
    at = new Date().toISOString();
  const prior = {
    safeId: safe,
    safe: wallet,
    chainId: 5042002,
    balance: "3000000000",
    observedAt: at,
    finalizedBlock: "100",
    finalizedBlockHash: hash,
    historyFrom: "0",
    transfers: [],
  };
  await pg.query("UPDATE records SET body=$1 WHERE kind='chain_observation'", [
    JSON.stringify(prior),
  ]);
  await record(
    "history_reconciliation",
    "99999999-9999-4999-8999-999999999999",
    {
      observationId: "77777777-7777-4777-8777-777777777777",
      finalizedBlockHash: hash,
      sourceDocumentIds: [invoice],
      attestedBy: wallet,
      transfers: [],
    },
  );
  const config = { organizationId: org, safe: wallet, chainId: 5042002 };
  const next = { ...prior, finalizedBlock: "101", observedAt: at };
  const extended = await pg.transaction((tx) =>
    persistStandingObservation(
      tx as unknown as Database,
      config,
      next,
      async () => true,
    ),
  );
  expect(extended.reconciled).toBe(true);
  const unknown = {
    ...next,
    finalizedBlock: "102",
    transfers: [
      {
        transactionHash: "0x" + "22".repeat(32),
        logIndex: 0,
        from: wallet,
        to: "0x2222222222222222222222222222222222222222",
        amount: "100",
        block: "102",
      },
    ],
  };
  expect(
    (
      await pg.transaction((tx) =>
        persistStandingObservation(
          tx as unknown as Database,
          config,
          unknown,
          async () => true,
        ),
      )
    ).reconciled,
  ).toBe(false);
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,source_tx,source_confirmed_at) VALUES($1,$2,$3,$4,'observed-source',100,'source_confirmed',$5,$6,now())",
    [
      payment,
      org,
      invoice,
      engagement,
      JSON.stringify({
        modulePermit: {
          sourceChainId: "5042002",
          destinationChainId: "5042002",
          recipient: "0x2222222222222222222222222222222222222222",
        },
      }),
      "0x" + "22".repeat(32),
    ],
  );
  const recovered = await pg.transaction((tx) =>
    persistStandingObservation(
      tx as unknown as Database,
      config,
      { ...unknown, finalizedBlock: "103" },
      async () => true,
    ),
  );
  expect(recovered.reconciled).toBe(true);
  const duplicateEffect = await pg.transaction((tx) =>
    persistStandingObservation(
      tx as unknown as Database,
      config,
      { ...unknown, finalizedBlock: "104", transfers: [...unknown.transfers, { ...unknown.transfers[0], logIndex: 1 }] },
      async () => true,
    ),
  );
  expect(duplicateEffect.reconciled).toBe(false);
  expect("reason" in duplicateEffect && duplicateEffect.reason).toMatch(/multiple|unique/i);
  const imprecise = await pg.transaction((tx) =>
    persistStandingObservation(
      tx as unknown as Database,
      config,
      { ...unknown, finalizedBlock: "105", incrementalHistoryComplete: false },
      async () => true,
    ),
  );
  expect(imprecise.reconciled).toBe(false);
  expect("reason" in imprecise && imprecise.reason).toMatch(/precision|incomplete/i);
});
it("persists a new executable covered decision while retaining the original conditional hold", async () => {
  const fixture = createDemoFixture();
  const input = {
    ...fixture,
    tenantId: org,
    engagement: { ...fixture.engagement, tenantId: org },
    invoice: { ...fixture.invoice, tenantId: org },
    policy: { ...fixture.policy, tenantId: org, coverageRequired: true },
    acceptances: fixture.acceptances.map((a) => ({ ...a, tenantId: org })),
  };
  const conditional = verifyObligation(input);
  const data = {
    id: "99999999-9999-4999-8999-999999999999",
    decision: conditional,
    input,
  };
  await record("decision", data.id, {
    decision: conditional,
    input: data.input,
  });
  const before = businessEvidenceCommitment(data.input);
  const funded = await persistCoveredDecision(
    db,
    { organizationId: org, wallet, role: "owner" },
    data,
    {
      reserve: wallet,
      coverageId: "0x" + "33".repeat(32),
      permitDigest: "0x" + "44".repeat(32),
    },
  );
  expect(funded.id).not.toBe(data.id);
  expect(funded.decision.executable).toBe(true);
  expect(businessEvidenceCommitment(funded.input)).toBe(before);
  expect(
    (
      await pg.query<{ body: { decision: { action: string } } }>(
        "SELECT body FROM records WHERE kind='decision' AND id=$1",
        [data.id],
      )
    ).rows[0].body.decision.action,
  ).toBe("HOLD");
  expect(
    (
      await pg.query<{
        body: { decision: { action: string }; coverageProof: unknown };
      }>("SELECT body FROM records WHERE kind='decision' AND id=$1", [
        funded.id,
      ])
    ).rows[0].body.decision.action,
  ).toBe("PAY");
});
