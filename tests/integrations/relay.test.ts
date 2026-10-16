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
  testnet: false,
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
    circleChain?: string;
    message?: Hex;
    complete?: boolean;
    verifyFails?: boolean;
  } = {},
): RelayDependencies & { runner: Mock<CircleRunner> } {
  const runner = vi.fn<CircleRunner>(async (args: string[]) => {
    if (args[0] === "wallet" && args[1] === "list")
      return { wallets: [{ type: "agent", address: c, blockchain: options.circleChain ?? "BASE" }] };
    if (args[0] === "transaction")
      return {
        transactions: [
          { id: "relay-provider", state: "COMPLETE", txHash: destination },
        ],
      };
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
/** Seed the already-existing operation without granting permission for a new broadcast. */
async function existingRelay(state: "uncertain" | "submitted", providerId: string | null = null) {
  await expect(runDestinationRelay(db, payment, permit, { ...config, enabled: false }, deps())).rejects.toThrow(/disabled/);
  await pg.query("UPDATE destination_relays SET state=$1,attempts=1,provider_id=$2", [state, providerId]);
}
describe("durable restricted CCTP relay", () => {
  it.each([
    { label: "mainnet", sourceChainId: 1, destinationChainId: 8453, circleChain: "BASE", testnet: false },
    { label: "testnet cross-chain", sourceChainId: 5042002, destinationChainId: 84532, circleChain: "BASE-SEPOLIA", testnet: true },
  ])("disables every fresh $label relay broadcast even when configuration enables it", async (network) => {
    const candidate = { ...config, sourceChainId: network.sourceChainId, destinationChainId: network.destinationChainId, circle: { ...config.circle, chain: network.circleChain }, testnet: network.testnet };
    const candidatePermit = { ...permit, chainId: String(network.sourceChainId), sourceChainId: String(network.sourceChainId), destinationChainId: String(network.destinationChainId) };
    await pg.query("UPDATE payment_intents SET permit=$1", [JSON.stringify({ modulePermit: candidatePermit })]);
    const d = deps({ circleChain: network.circleChain });
    await expect(runDestinationRelay(db, { ...payment, permit: { modulePermit: candidatePermit } }, candidatePermit, candidate, d)).rejects.toThrow(/relay submission is disabled/i);
    expect(d.runner).not.toHaveBeenCalled();
    const relayId = relayOperationId(org, paymentId, network.destinationChainId);
    expect(relayId).not.toBe(paymentId);
    expect(relayId).toMatch(/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    const stored = (await pg.query<{ id: string; state: string; attempts: number }>("SELECT id,state,attempts FROM destination_relays")).rows;
    expect(stored).toEqual([{ id: relayId, state: "prepared", attempts: 0 }]);
  });
  it("preserves an unknown existing operation and never blindly resubmits after a restart", async () => {
    await existingRelay("uncertain");
    const next = deps();
    const result = await runDestinationRelay(db, payment, permit, config, next);
    expect(result.finalized).toBe(false);
    expect(next.runner).not.toHaveBeenCalled();
    expect((await pg.query<{ state: string; attempts: number }>("SELECT state,attempts FROM destination_relays")).rows).toEqual([{ state: "uncertain", attempts: 1 }]);
  });
  it("requires independently verified destination effect after authenticated transaction attachment", async () => {
    await existingRelay("uncertain");
    await attachDestinationRelayTransaction(db, { wallet: a, organizationId: org, role: "operator" }, paymentId, destination, "Recovered the existing Circle relay transaction");
    const wrong = deps({ verifyFails: true });
    await expect(runDestinationRelay(db, payment, permit, config, wrong)).rejects.toThrow(/Wrong destination/);
    expect(wrong.runner).not.toHaveBeenCalled();
    expect((await pg.query<{ state: string }>("SELECT state FROM destination_relays")).rows[0].state).not.toBe("settled");
    const valid = deps();
    expect((await runDestinationRelay(db, payment, permit, config, valid)).finalized).toBe(true);
    expect(valid.runner).not.toHaveBeenCalled();
  });
  it("rejects tenant/permit/route mismatch and zero-fee violations without submission", async () => {
    const d = deps();
    await expect(runDestinationRelay(db, { ...payment, organization_id: "99999999-9999-4999-8999-999999999999" }, permit, config, d)).rejects.toThrow();
    await expect(runDestinationRelay(db, payment, { ...permit, maxFee: "1" }, config, d)).rejects.toThrow();
    await expect(runDestinationRelay(db, payment, permit, config, deps({ message: message(a) }))).rejects.toThrow(/matching/);
    await expect(runDestinationRelay(db, payment, permit, config, deps({ message: message(b, 1n) }))).rejects.toThrow(/matching/);
    expect(d.runner).not.toHaveBeenCalled();
  });
  it("waits for attestation and rejects a changed route configuration for an existing relay", async () => {
    const d = deps({ complete: false });
    expect((await runDestinationRelay(db, payment, permit, config, d)).finalized).toBe(false);
    expect(d.runner).not.toHaveBeenCalled();
    await expect(runDestinationRelay(db, payment, permit, { ...config, destinationTransmitter: b }, deps())).rejects.toThrow(/binding/);
  });
  it("blocks fresh execution when relay submission is disabled in configuration", async () => {
    const d = deps();
    await expect(runDestinationRelay(db, payment, permit, { ...config, enabled: false }, d)).rejects.toThrow(/disabled/);
    expect(d.runner).not.toHaveBeenCalled();
  });
  it("keeps provider lookup and reconciliation available with submission disabled and expired evidence", async () => {
    await existingRelay("submitted", "relay-provider");
    const d = deps();
    expect((await runDestinationRelay(db, payment, permit, { ...config, enabled: false, review: { ...config.review, expiresAt: "2020-01-01T00:00:00Z" } }, d)).finalized).toBe(true);
    expect(d.runner.mock.calls).toHaveLength(1);
    expect(d.runner.mock.calls.every(([args]) => args[0] === "transaction" && args[1] === "list")).toBe(true);
    expect((await pg.query<{ state: string; attempts: number }>("SELECT state,attempts FROM destination_relays")).rows).toEqual([{ state: "settled", attempts: 1 }]);
  });
  it("requires real source confirmation and blocks fresh sends even if review evidence has expired", async () => {
    const d = deps();
    d.verifySource = vi.fn(async () => ({ finalized: false, transaction: source, blockHash: source, blockNumber: "100", crossChain: true }));
    await expect(runDestinationRelay(db, payment, permit, config, d)).rejects.toThrow(/source finality/);
    expect(d.runner).not.toHaveBeenCalled();
    await expect(runDestinationRelay(db, payment, permit, { ...config, review: { ...config.review, expiresAt: "2020-01-01T00:00:00Z" } }, deps())).rejects.toThrow(/disabled/);
    expect((await pg.query<{ attempts: number }>("SELECT attempts FROM destination_relays")).rows[0].attempts).toBe(0);
  });
  it("blocks concurrent new relay broadcasts and cross-tenant transaction attachment", async () => {
    const d = deps();
    const outcomes = await Promise.allSettled([
      runDestinationRelay(db, payment, permit, config, d),
      runDestinationRelay(db, payment, permit, config, d),
    ]);
    expect(outcomes.every((result) => result.status === "rejected" && /disabled/.test(String(result.reason)))).toBe(true);
    expect(d.runner).not.toHaveBeenCalled();
    expect((await pg.query<{ attempts: number }>("SELECT attempts FROM destination_relays")).rows).toEqual([{ attempts: 0 }]);
    await expect(attachDestinationRelayTransaction(db, { wallet: a, organizationId: "99999999-9999-4999-8999-999999999999", role: "operator" }, paymentId, destination, "Existing relay transaction")).rejects.toThrow();
  });
});
