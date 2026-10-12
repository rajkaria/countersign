import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { readSafe } from "../../src/lib/integrations/chain";

const { client } = vi.hoisted(() => ({
  client: { getChainId: vi.fn(), getBlock: vi.fn(), getCode: vi.fn(), readContract: vi.fn(), getLogs: vi.fn() },
}));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => client }));
const safe = ("0x" + "11".repeat(20)) as Address,
  recipient = ("0x" + "22".repeat(20)) as Address,
  token = "0x3600000000000000000000000000000000000000" as Address,
  system = "0xfffffffffffffffffffffffffffffffffffffffe" as Address,
  hash = ("0x" + "33".repeat(32)) as Hex;
type ObservedLog = {
  address: Address;
  args: { from: Address; to: Address; value: bigint };
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  removed: boolean;
};
let logs: ObservedLog[];
function transfer(address: Address, value: bigint, logIndex: number, from = safe, to = recipient): ObservedLog {
  return { address, args: { from, to, value }, transactionHash: hash, logIndex, blockNumber: 19999n, removed: false };
}
beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  client.getChainId.mockResolvedValue(5042002);
  client.getCode.mockResolvedValue("0x1234");
  client.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber?: bigint }) => ({ number: blockNumber ?? 20000n, hash, timestamp: BigInt(Date.parse("2026-10-13T00:00:00Z") / 1000) }));
  client.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => ({ getOwners: [safe], getThreshold: 1n, nonce: 0n, balanceOf: 700n, decimals: 6, isModuleEnabled: true })[functionName as "decimals"]);
  client.getLogs.mockImplementation(async ({ address, args }: { address: Address; args: { from?: Address; to?: Address } }) => logs.filter((log) => log.address.toLowerCase() === address.toLowerCase() && (!args.from || log.args.from === args.from) && (!args.to || log.args.to === args.to)));
});
const input = { rpcUrl: "https://fixture.invalid", chainId: 5042002, safe, token, historyBlocks: 1000 };
describe("bounded finalized Arc native USDC observations", () => {
  it("observes plain native sends and counts an ERC20 movement only once", async () => {
    logs = [transfer(system, 100n * 10n ** 12n, 0), transfer(system, 200n * 10n ** 12n, 1), transfer(token, 200n, 2)];
    const observation = await readSafe(input);
    expect(observation.transfers.map((log) => [log.logIndex, log.amount])).toEqual([[0, "100"], [1, "200"]]);
    expect(observation.transfers[0]).toMatchObject({ nativeAmount: "100000000000000", nativeDecimals: 18 });
    expect(observation.incrementalHistoryComplete).toBe(true);
    expect(observation.historyComplete).toBe(false);
    expect(client.getLogs.mock.calls.every(([query]) => query.address.toLowerCase() === system)).toBe(true);
  });
  it("rounds outgoing liability up and incoming funds down, preserving native precision for review", async () => {
    logs = [transfer(system, 1n, 0), transfer(system, 10n ** 12n + 1n, 1, recipient, safe)];
    const observation = await readSafe(input);
    expect(observation.transfers.map((log) => log.amount)).toEqual(["1", "1"]);
    expect(observation.transfers.map((log) => log.nativeAmount)).toEqual(["1", "1000000000001"]);
    expect(observation.incrementalHistoryComplete).toBe(false);
    expect(observation.limitations.join(" ")).toMatch(/gas fees/i);
  });
  it("refuses to silently backfill testnet history across pre-Zero5 events", async () => {
    client.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber?: bigint }) => ({ number: blockNumber ?? 20000n, hash, timestamp: blockNumber === undefined ? 1791849600n : 1779894516n }));
    await expect(readSafe(input)).rejects.toThrow(/historical.*reconciliation/i);
    expect(client.getLogs).not.toHaveBeenCalled();
  });
  it("rejects token-decimal mismatch before interpreting system event units", async () => {
    const base = client.readContract.getMockImplementation()!;
    client.readContract.mockImplementation(async (query) => query.functionName === "decimals" ? 18 : base(query));
    await expect(readSafe(input)).rejects.toThrow(/Arc USDC.*6 decimals/);
  });
  it("rejects malformed or non-finalized system logs rather than dropping an unknown debit", async () => {
    logs = [{ ...transfer(system, 1n, 0), removed: true }];
    await expect(readSafe(input)).rejects.toThrow(/transfer history/i);
  });
  it("keeps ordinary ERC20 observation units on other chains", async () => {
    client.getChainId.mockResolvedValue(8453);
    logs = [transfer(token, 100n, 0)];
    const observation = await readSafe({ ...input, chainId: 8453 });
    expect(observation.transfers[0]).toMatchObject({ amount: "100" });
    expect(observation.transfers[0]).not.toHaveProperty("nativeAmount");
    expect(client.getLogs.mock.calls.every(([query]) => query.address === token)).toBe(true);
  });
});
