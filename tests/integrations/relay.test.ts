import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
  type Mock,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { encodePacked, keccak256, stringToHex, type Hex } from "viem";
import {
  runDestinationRelay,
  relayOperationId,
  attachDestinationRelayTransaction,
  type DestinationRelayConfig,
  type RelayDependencies,
} from "../../src/lib/integrations/relay";
import { modulePermitSchema } from "../../src/lib/integrations/module";
import { CCTP_ROUTE } from "../../src/lib/integrations/chain";
import type { Database } from "../../src/lib/server/db";
import type { CircleRunner } from "../../src/lib/integrations/circle";
import type { PaymentRow } from "../../src/lib/server/worker";
const org = "11111111-1111-4111-8111-111111111111",
  paymentId = "22222222-2222-4222-8222-222222222222";
const a = `0x${"11".repeat(20)}` as Hex,
  b = `0x${"22".repeat(20)}` as Hex,
  c = `0x${"33".repeat(20)}` as Hex,
  source = `0x${"44".repeat(32)}` as Hex,
  destination = `0x${"55".repeat(32)}` as Hex,
  word = (a: string) => `0x${a.slice(2).padStart(64, "0")}` as Hex,
  zero = `0x${"00".repeat(32)}` as Hex;
const permit = modulePermitSchema.parse({
  schemaVersion: "1",
  chainId: "1",
  safe: a,
  module: a,
  policyEpoch: "1",
  engagementId: word(a),
  engagementVersion: "1",
  obligationId: word(b),
  allocationId: word(a),
  paymentId: keccak256(stringToHex(paymentId)),
  sourceChainId: "1",
  destinationChainId: "8453",
  recipient: b,
  token: a,
  amount: "100",
  maxFee: "0",
  route: CCTP_ROUTE,
  evidenceCommitment: word(b),
  expiresAt: "9999999999",
  nonce: "1",
  coverageId: zero,
  destinationDomain: "6",
  minFinalityThreshold: "2000",
});
const config: DestinationRelayConfig = {
  organizationId: org,
  sourceChainId: 1,
  destinationChainId: 8453,
  sourceDomain: 0,
  destinationDomain: 6,
  sourceMessenger: a,
  destinationMessenger: b,
  sourceAdapter: c,
  destinationTransmitter: c,
  destinationToken: b,
  sourceRpcUrl: "https://source.example",
  destinationRpcUrl: "https://destination.example",
  destinationTransmitterCodeHash: source,
  destinationMessengerCodeHash: source,
  sourceModule: a,
  sourceSafe: a,
  sourceToken: a,
  circle: {
    binary: "circle",
    wallet: c,
    chain: "BASE",
    cliHome: "/private/destination-circle",
  },
  review: {
    reviewer: "Independent operator",
    reportHash: source,
    compatibilityTransaction: destination,
    verifiedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2030-01-01T00:00:00Z",
  },
  testnet: true,
  enabled: true,
};
const payment: PaymentRow = {
  id: paymentId,
  organization_id: org,
  invoice_id: "33333333-3333-4333-8333-333333333333",
  engagement_id: "44444444-4444-4444-8444-444444444444",
  amount: "100",
  state: "destination_pending",
  permit: { modulePermit: permit },
  provider_id: "source-operation",
  source_tx: source,
  destination_tx: null,
};
function message(recipient = b, fee = 0n): Hex {
  return encodePacked(
    [
      "uint32",
      "uint32",
      "uint32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "uint32",
      "uint32",
      "uint32",
      "bytes32",
      "bytes32",
      "uint256",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      1,
      0,
      6,
      word(a),
      word(a),
      word(b),
      zero,
      2000,
      2000,
      1,
      word(a),
      word(recipient),
      100n,
      word(c),
      0n,
      fee,
      0n,
    ],
  );
}
const attestation = `0x${"ab".repeat(65)}`;
let pg: PGlite, db: Database;
function deps(
  options: {
    timeout?: boolean;
    message?: Hex;
    complete?: boolean;
    verifyFails?: boolean;
  } = {},
): RelayDependencies & { runner: Mock<CircleRunner> } {
  const runner = vi.fn<CircleRunner>(async (args: string[]) => {
    if (args[0] === "wallet" && args[1] === "list")
      return { wallets: [{ type: "agent", address: c, blockchain: "BASE" }] };
    if (args[0] === "transaction")
      return {
        transactions: [
          { id: "relay-provider", state: "COMPLETE", txHash: destination },
        ],
      };
    if (options.timeout) throw new Error("timeout");
    return { id: "relay-provider", state: "PENDING", txHash: destination };
  });
  return {
    runner,
    fetcher: vi.fn(async () =>
      Response.json({
        messages: [
          {
            status: options.complete === false ? "pending" : "complete",
            message: options.message ?? message(),
            attestation,
          },
        ],
      }),
    ) as typeof fetch,
    verifySource: vi.fn(async () => ({
      finalized: true,
      transaction: source,
      blockHash: source,
      blockNumber: "100",
      crossChain: true,
    })),
    preflight: vi.fn(async () => {}),
    verifyDestination: vi.fn(async () => {
      if (options.verifyFails) throw new Error("Wrong destination event");
      return {
        finalized: true,
        transaction: destination,
        nonce: word(a),
        amount: "100",
        recipient: b,
        chainId: 8453,
        blockHash: destination,
      };
    }),
  };
}
beforeAll(async () => {
  pg = new PGlite();
  for (const file of [
    "001_foundation.sql",
    "002_security_controls.sql",
    "003_relay.sql",
  ])
    await pg.exec(await readFile(`migrations/${file}`, "utf8"));
  db = pg as unknown as Database;
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE");
  await pg.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    org,
    "Relay fixture",
  ]);
  await pg.query("INSERT INTO members VALUES($1,$2,'operator')", [org, a]);
  await pg.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,source_tx) VALUES($1,$2,$3,$4,$9,$5,$6,$7,$8)",
    [
      paymentId,
      org,
      payment.invoice_id,
      payment.engagement_id,
      payment.amount,
      payment.state,
      JSON.stringify(payment.permit),
      source,
      `source:${paymentId}`,
    ],
  );
});
afterAll(() => pg.close());
describe("durable restricted CCTP relay", () => {
  it("uses a distinct deterministic UUID and submits only the exact destination call after persistence", async () => {
    const d = deps(),
      original = d.runner.getMockImplementation()!;
    d.runner.mockImplementation(async (args: string[]) => {
      if (args[1] === "execute") {
        const row = (
          await pg.query<{ state: string; attempts: number }>(
            "SELECT state,attempts FROM destination_relays",
          )
        ).rows[0];
        expect(row).toMatchObject({ state: "submitting", attempts: 1 });
      }
      return original(args);
    });
    const first = await runDestinationRelay(db, payment, permit, config, d);
    expect(first.finalized).toBe(false);
    const relayId = relayOperationId(org, paymentId, 8453);
    expect(relayId).not.toBe(paymentId);
    expect(relayId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
    const call = d.runner.mock.calls.find((c) => c[0][1] === "execute")![0];
    expect(call).toEqual([
      "wallet",
      "execute",
      "receiveMessage(bytes,bytes)",
      message(),
      attestation,
      "--contract",
      c,
      "--address",
      c,
      "--chain",
      "BASE",
      "--amount",
      "0",
      "--idempotency-key",
      relayId,
      "--output",
      "json",
    ]);
    const second = await runDestinationRelay(db, payment, permit, config, d);
    expect(second).toEqual({ finalized: true, transaction: destination });
    expect(
      d.runner.mock.calls.filter((c) => c[0][1] === "execute"),
    ).toHaveLength(1);
  });
  it("persists unknown timeout and never blindly resubmits after a restart", async () => {
    const d = deps({ timeout: true });
    await runDestinationRelay(db, payment, permit, config, d);
    const next = deps();
    const result = await runDestinationRelay(db, payment, permit, config, next);
    expect(result.finalized).toBe(false);
    expect(next.runner.mock.calls.some((c) => c[0][1] === "execute")).toBe(
      false,
    );
    expect(
      (
        await pg.query<{ state: string }>(
          "SELECT state FROM destination_relays",
        )
      ).rows[0].state,
    ).toBe("uncertain");
  });
  it("requires independently verified destination effect after authenticated transaction attachment", async () => {
    await runDestinationRelay(
      db,
      payment,
      permit,
      config,
      deps({ timeout: true }),
    );
    await attachDestinationRelayTransaction(
      db,
      { wallet: a, organizationId: org, role: "operator" },
      paymentId,
      destination,
      "Recovered the existing Circle relay transaction",
    );
    await expect(
      runDestinationRelay(
        db,
        payment,
        permit,
        config,
        deps({ verifyFails: true }),
      ),
    ).rejects.toThrow(/Wrong destination/);
    expect(
      (
        await pg.query<{ state: string }>(
          "SELECT state FROM destination_relays",
        )
      ).rows[0].state,
    ).not.toBe("settled");
    expect(
      (await runDestinationRelay(db, payment, permit, config, deps()))
        .finalized,
    ).toBe(true);
  });
  it("rejects tenant/permit/route mismatch and zero-fee violations without submission", async () => {
    const d = deps();
    await expect(
      runDestinationRelay(
        db,
        { ...payment, organization_id: "99999999-9999-4999-8999-999999999999" },
        permit,
        config,
        d,
      ),
    ).rejects.toThrow();
    await expect(
      runDestinationRelay(db, payment, { ...permit, maxFee: "1" }, config, d),
    ).rejects.toThrow();
    await expect(
      runDestinationRelay(
        db,
        payment,
        permit,
        config,
        deps({ message: message(a) }),
      ),
    ).rejects.toThrow(/matching/);
    expect(d.runner).not.toHaveBeenCalled();
  });
  it("waits for attestation and rejects a changed route configuration for an existing relay", async () => {
    const d = deps({ complete: false });
    expect(
      (await runDestinationRelay(db, payment, permit, config, d)).finalized,
    ).toBe(false);
    expect(d.runner).not.toHaveBeenCalled();
    await expect(
      runDestinationRelay(
        db,
        payment,
        permit,
        { ...config, destinationTransmitter: b },
        deps(),
      ),
    ).rejects.toThrow(/binding/);
  });
  it("allows reconciliation with submission disabled but never new execution", async () => {
    const d = deps();
    await expect(
      runDestinationRelay(
        db,
        payment,
        permit,
        { ...config, enabled: false },
        d,
      ),
    ).rejects.toThrow(/disabled/);
    expect(d.runner.mock.calls.some((c) => c[0][1] === "execute")).toBe(false);
  });
  it("keeps already submitted reconciliation available when relay submission is disabled", async () => {
    await runDestinationRelay(db, payment, permit, config, deps());
    const d = deps();
    expect(
      (
        await runDestinationRelay(
          db,
          payment,
          permit,
          { ...config, enabled: false },
          d,
        )
      ).finalized,
    ).toBe(true);
    expect(d.runner.mock.calls.some((c) => c[0][1] === "execute")).toBe(false);
  });
  it("requires real source confirmation and current reviewed destination configuration before attempting submission", async () => {
    const d = deps();
    d.verifySource = vi.fn(async () => ({
      finalized: false,
      transaction: source,
      blockHash: source,
      blockNumber: "100",
      crossChain: true,
    }));
    await expect(
      runDestinationRelay(db, payment, permit, config, d),
    ).rejects.toThrow(/source finality/);
    expect(d.runner).not.toHaveBeenCalled();
    await expect(
      runDestinationRelay(
        db,
        payment,
        permit,
        {
          ...config,
          review: { ...config.review, expiresAt: "2020-01-01T00:00:00Z" },
        },
        deps(),
      ),
    ).rejects.toThrow(/expired/);
    expect(
      (
        await pg.query<{ attempts: number }>(
          "SELECT attempts FROM destination_relays",
        )
      ).rows[0].attempts,
    ).toBe(0);
  });
  it("prevents concurrent submitters and cross-tenant transaction attachment", async () => {
    const d = deps();
    await Promise.all([
      runDestinationRelay(db, payment, permit, config, d),
      runDestinationRelay(db, payment, permit, config, d),
    ]);
    expect(
      d.runner.mock.calls.filter((c) => c[0][1] === "execute"),
    ).toHaveLength(1);
    await expect(
      attachDestinationRelayTransaction(
        db,
        {
          wallet: a,
          organizationId: "99999999-9999-4999-8999-999999999999",
          role: "operator",
        },
        paymentId,
        destination,
        "Existing relay transaction",
      ),
    ).rejects.toThrow();
  });
});
