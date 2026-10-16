import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, stringToHex } from "viem";
import { createDemoFixture, verifyObligation } from "../../src/lib/domain";
import { businessEvidenceCommitment } from "../../src/lib/domain/evidence";
import type { ModulePermit } from "../../src/lib/integrations/module";
import type { DeploymentManifest } from "../../src/lib/integrations/manifest";
import { authorizePreparedPayment } from "../../src/lib/server/authorization";
import type { Database } from "../../src/lib/server/db";
import type { PaymentRow } from "../../src/lib/server/worker";

const { client, evaluateInvoice, signTypedData } = vi.hoisted(() => ({
  client: { getChainId: vi.fn(), getCode: vi.fn(), getTransactionReceipt: vi.fn(), getBlock: vi.fn(), readContract: vi.fn(), simulateContract: vi.fn() },
  evaluateInvoice: vi.fn(),
  signTypedData: vi.fn(),
}));
// These are the external RPC, retained-record review, and signing boundaries.
vi.mock("../../src/lib/integrations/chain", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/integrations/chain")>(),
  chainClient: () => client,
  checkModuleDeployment: async () => ({ valid: true }),
}));
vi.mock("../../src/lib/server/review", () => ({ evaluateInvoice }));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: () => ({ address: "0x" + "44".repeat(20), signTypedData }) }));

const org = "11111111-1111-4111-8111-111111111111";
const actor = { organizationId: org, role: "owner" as const, wallet: "0x" + "11".repeat(20) };
const manifest: DeploymentManifest = {
  schemaVersion: 1, organizationId: org, chainId: 5042002,
  safe: "0x" + "11".repeat(20), module: "0x" + "22".repeat(20),
  token: "0x3600000000000000000000000000000000000000", tokenDecimals: 6,
  moduleCodeHash: keccak256("0x1234"), circleWallet: "0x" + "33".repeat(20), circleChain: "ARC-TESTNET", verifier: "0x" + "44".repeat(20),
  verifiedAt: "2026-09-27T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z",
  compatibility: { cliVersion: "1.1.4", moduleExecutionTransaction: "0x" + "55".repeat(32), revocationTransaction: "0x" + "66".repeat(32), renewalEvidenceHash: "0x" + "77".repeat(32) },
  securityReview: { reviewer: "Independent fixture reviewer", reportHash: "0x" + "88".repeat(32), approvedAt: "2026-09-27T00:00:00Z" }, testnet: true,
};
let input: ReturnType<typeof createDemoFixture>;
let row: PaymentRow;
let writes: string[];
const db: Database = {
  async query<T>(sql: string) {
    let rows: unknown[] = [];
    if (sql.startsWith("SELECT id FROM organizations")) rows = [{ id: org }];
    else if (sql.startsWith("SELECT role FROM members")) rows = [{ role: "owner" }];
    else if (sql.startsWith("SELECT * FROM payment_intents")) rows = [row];
    else writes.push(sql);
    return { rows: rows as T[] };
  },
};
function persistedPermit(change: Partial<ModulePermit> = {}): ModulePermit {
  return {
    schemaVersion: "1", chainId: "5042002", sourceChainId: "5042002", destinationChainId: "5042002",
    safe: manifest.safe, module: manifest.module, token: manifest.token,
    policyEpoch: "1", engagementId: keccak256(stringToHex(input.engagement.id)), engagementVersion: "1", obligationId: keccak256(stringToHex(input.invoice.obligationId)),
    allocationId: "0x" + "33".repeat(32), paymentId: "0x" + "44".repeat(32),
    recipient: input.invoice.destination.address, amount: "800000000", maxFee: "0", route: keccak256(stringToHex("DIRECT_ERC20_V1")), evidenceCommitment: businessEvidenceCommitment(input),
    expiresAt: "1790589840", nonce: "1", coverageId: "0x" + "00".repeat(32), destinationDomain: "0", minFinalityThreshold: "0", ...change,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T10:00:00Z"));
  input = createDemoFixture();
  row = { id: "99999999-9999-4999-8999-999999999999", organization_id: org, invoice_id: "invoice", engagement_id: "engagement", amount: "800000000", state: "prepared", permit: {}, provider_id: null, source_tx: null, destination_tx: null };
  writes = [];
  evaluateInvoice.mockImplementation(async () => ({ id: "decision", input, decision: verifyObligation(input) }));
  client.getChainId.mockResolvedValue(5042002);
  client.getCode.mockResolvedValue("0x1234");
  client.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n });
  client.getBlock.mockResolvedValue({ number: 11n });
  client.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "policyEpoch") return 1n;
    if (functionName === "obligationEngagement") return keccak256(stringToHex(input.engagement.id));
    if (functionName === "obligationLimit") return 3200000000n;
    if (functionName === "obligationPaid") return 0n;
    if (functionName === "engagements") return [1n, input.invoice.destination.address, BigInt(input.invoice.destination.chainId), 1000000000n, 2000000000n, 3000000000n, true];
    throw new Error(`Unexpected contract read: ${functionName}`);
  });
  signTypedData.mockResolvedValue("0x1234");
  client.simulateContract.mockResolvedValue({});
  vi.stubEnv("EXECUTION_MANIFEST_JSON", JSON.stringify(manifest));
  vi.stubEnv("EXECUTION_ENABLED", "true");
  vi.stubEnv("SOURCE_RPC_URL", "https://fixture.invalid");
  vi.stubEnv("VERIFIER_PRIVATE_KEY", "0x" + "11".repeat(32));
  vi.stubEnv("CCTP_DESTINATION_DOMAIN", "0");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("testnet-only authorization before signing", () => {
  it("authorizes a matching Arc testnet obligation after the existing review and deployment gates", async () => {
    await expect(authorizePreparedPayment(db, actor, row.id)).resolves.toMatchObject({ id: row.id, state: "authorized" });
    expect(writes.filter((sql) => sql.startsWith("UPDATE payment_intents SET state='authorized'"))).toHaveLength(1);
    expect(writes.filter((sql) => sql.startsWith("INSERT INTO outbox"))).toHaveLength(1);
  });
  it("rechecks deployment expiry after contract reads and before signing", async () => {
    vi.stubEnv("EXECUTION_MANIFEST_JSON", JSON.stringify({ ...manifest, expiresAt: "2026-09-28T10:00:01Z" }));
    const read = client.readContract.getMockImplementation()!;
    client.readContract.mockImplementation(async (args) => {
      const result = await read(args);
      if (args.functionName === "engagements") vi.setSystemTime(new Date("2026-09-28T10:00:01Z"));
      return result;
    });
    await expect(authorizePreparedPayment(db, actor, row.id)).rejects.toThrow(/stale or future-dated/);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it("does not persist new authority when deployment evidence expires during simulation", async () => {
    vi.stubEnv("EXECUTION_MANIFEST_JSON", JSON.stringify({ ...manifest, expiresAt: "2026-09-28T10:00:01Z" }));
    client.simulateContract.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-09-28T10:00:01Z"));
      return {};
    });
    await expect(authorizePreparedPayment(db, actor, row.id)).rejects.toThrow(/stale or future-dated/);
    expect(writes).toEqual([]);
  });
  it.each([5042, 1, 84532])("rejects an otherwise approved destination on chain %i", async (chainId) => {
    const destination = { ...input.invoice.destination, chainId };
    input = { ...input, invoice: { ...input.invoice, destination }, engagement: { ...input.engagement, destinations: [destination] } };
    await expect(authorizePreparedPayment(db, actor, row.id)).rejects.toThrow(/Arc testnet only/i);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it.each([
    { chainId: 1 },
    { address: "0x" + "99".repeat(20) },
    { decimals: 18 },
  ])("rejects an unsupported obligation asset before signing: %j", async (change) => {
    input = { ...input, engagement: { ...input.engagement, asset: { ...input.engagement.asset, ...change } } };
    await expect(authorizePreparedPayment(db, actor, row.id)).rejects.toThrow(/Arc testnet only/i);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it.each([
    { chainId: "1" },
    { sourceChainId: "1" },
    { destinationChainId: "1" },
    { token: "0x" + "99".repeat(20) },
  ])("rejects an existing unsigned permit with unsupported network or token: %j", async (change) => {
    row.permit.modulePermit = persistedPermit(change);
    await expect(authorizePreparedPayment(db, actor, row.id)).rejects.toThrow(/Arc testnet only/i);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
