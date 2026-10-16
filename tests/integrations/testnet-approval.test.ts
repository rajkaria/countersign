import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, stat, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, getAddress, keccak256, parseAbi, stringToHex } from "viem";
import { createTestnetApprovalPlan, probeTestnetApproval } from "../../src/lib/integrations/testnet-approval";

const now = new Date("2026-10-16T12:00:00Z");
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const input = {
  schemaVersion: 1, organizationId: "11111111-1111-4111-8111-111111111111",
  chainId: 5042002, sourceChainId: 5042002, destinationChainId: 5042002,
  circleChain: "ARC-TESTNET", testnet: true,
  token: "0x3600000000000000000000000000000000000000", tokenDecimals: 6,
  safe: addr(10), module: addr(20), circleExecutor: addr(30), verifier: addr(40), recipient: addr(50),
  expectedSafeOwners: [addr(60), addr(70)], expectedSafeThreshold: 2,
  engagementId: "engagement-one", engagementVersion: 2, obligationId: "milestone-one",
  amountAtomic: "1000000", cashFloorAtomic: "0",
  expiresAt: "2026-10-16T13:00:00Z", workerStopAt: "2026-10-18T20:00:00Z",
  funding: { from: addr(60) },
};
const cleanup: string[] = [];
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });

async function actualModuleAbi() {
  // Read the checked-in Solidity declarations instead of requiring ignored build
  // artifacts to exist before the Node tests run in a fresh checkout.
  const source = await readFile(new URL("../../contracts/src/CountersignModule.sol", import.meta.url), "utf8");
  const structs = ["Policy", "Engagement"].map((name) => source.match(new RegExp(`struct ${name} \\{[^}]+\\}`))![0]);
  const functions = ["configure", "setEngagement", "setObligation", "pause", "revoke"].map((name) => source.match(new RegExp(`function ${name}\\([^)]*\\)`))![0].replace(/\b(calldata|memory)\s+/g, ""));
  return parseAbi([...structs, ...functions].map((declaration) => declaration.replace(/\s+/g, " ")));
}

describe("unsigned testnet owner approval plan", () => {
  it("encodes exact Safe-owner setup and recovery calls using the actual Solidity ABI declarations", async () => {
    expect(() => createTestnetApprovalPlan(input, now)).not.toThrow();
    const plan = createTestnetApprovalPlan(input, now);
    const moduleAbi = await actualModuleAbi();
    expect(plan).toMatchObject({ unsigned: true, executionEnabled: false, mainnetEnabled: false, ownerConsent: false, independentSecurityApproval: false, providerSecurityApproval: false });
    expect(plan.setupCalls.map((c) => c.functionName)).toEqual(["enableModule", "setEngagement", "setObligation", "configure"]);
    const enable = decodeFunctionData({ abi: parseAbi(["function enableModule(address module)"]), data: plan.setupCalls[0].data });
    expect(enable.args).toEqual([input.module]);
    const decoded = plan.setupCalls.slice(1).map((c) => decodeFunctionData({ abi: moduleAbi, data: c.data }));
    expect(decoded[0]).toMatchObject({ functionName: "setEngagement", args: [keccak256(stringToHex("engagement-one")), { version: 2n, recipient: input.recipient, destinationChainId: 5042002n, perPayment: 1000000n, rolling24h: 1000000n, lifetime: 1000000n, active: true }] });
    expect(decoded[1].args).toEqual([keccak256(stringToHex("milestone-one")), keccak256(stringToHex("engagement-one")), 1000000n]);
    expect(decoded[2].args).toEqual([input.circleExecutor, input.verifier, { perPayment: 1000000n, rolling24h: 1000000n, lifetime: 1000000n, cashFloor: 0n, validUntil: 1792155600n, coveredOnly: false }]);
    for (const call of plan.setupCalls) expect(call).toMatchObject({ from: input.safe, value: "0", operation: 0, unsigned: true });
    expect(plan.recoveryCalls.map((c) => decodeFunctionData({ abi: moduleAbi, data: c.data }).functionName)).toEqual(["pause", "revoke"]);
    expect(plan.recoveryCalls.every((c) => c.from === input.safe && c.to === input.module)).toBe(true);
    const funding = decodeFunctionData({ abi: parseAbi(["function transfer(address to,uint256 amount) returns (bool)"]), data: plan.fundingProposal!.data });
    expect(funding.args).toEqual([getAddress(input.safe), 1000000n]);
    expect(plan.fundingProposal).toMatchObject({ from: addr(60), to: input.token, separateApprovalRequired: true });
    expect(plan.limitations.join(" ")).toMatch(/configure unpauses/);
    expect(plan.limitations.join(" ")).toMatch(/unprotected/i);
  });

  it("hashes every canonical public input and calldata, with stable key ordering", () => {
    const plan = createTestnetApprovalPlan(input, now);
    const reordered = Object.fromEntries(Object.entries(input).reverse());
    expect(createTestnetApprovalPlan(reordered, now).planHash).toBe(plan.planHash);
    const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
    const { planHash, ...body } = plan;
    expect(keccak256(stringToHex(JSON.stringify(canonical(body))))).toBe(planHash);
    expect(createTestnetApprovalPlan({ ...input, amountAtomic: "999999" }, now).planHash).not.toBe(planHash);
    expect(createTestnetApprovalPlan({ ...input, cashFloorAtomic: "1" }, now).planHash).not.toBe(planHash);
    expect(createTestnetApprovalPlan({ ...input, expectedSafeThreshold: 1 }, now).planHash).not.toBe(planHash);
    expect(createTestnetApprovalPlan({ ...input, funding: undefined }, now).fundingProposal).toBeNull();
  });

  it.each([
    ["mainnet", { chainId: 5042 }], ["cross-chain", { destinationChainId: 84532 }],
    ["wrong source", { sourceChainId: 1 }], ["mainnet Circle", { circleChain: "ARC" }],
    ["false testnet", { testnet: false }], ["wrong token", { token: addr(80) }],
    ["native precision", { tokenDecimals: 18 }], ["zero amount", { amountAtomic: "0" }],
    ["over first-proof cap", { amountAtomic: "1000001" }], ["noncanonical amount", { amountAtomic: "01" }],
    ["negative floor", { cashFloorAtomic: "-1" }], ["uint256 overflow", { cashFloorAtomic: (2n ** 256n).toString() }],
    ["zero admin", { verifier: addr(0) }], ["colliding admin", { verifier: input.circleExecutor }],
    ["executor owner", { expectedSafeOwners: [input.circleExecutor] }],
    ["verifier owner", { expectedSafeOwners: [input.verifier] }],
    ["duplicate owner", { expectedSafeOwners: [addr(60), addr(60)] }],
    ["impossible threshold", { expectedSafeThreshold: 3 }], ["missing owners", { expectedSafeOwners: [] }],
    ["recipient collision", { recipient: input.safe }], ["invalid organization", { organizationId: "org" }],
    ["invalid version", { engagementVersion: 0 }], ["expired", { expiresAt: now.toISOString() }],
    ["over 24h", { expiresAt: "2026-10-17T12:00:01Z" }],
    ["after worker stop", { workerStopAt: "2026-10-16T12:30:00Z" }],
    ["fractional contract time", { expiresAt: "2026-10-16T13:00:00.001Z" }],
    ["secret field", { privateKey: "must-not-be-accepted" }],
  ])("rejects %s before producing authority", (_label, change) => {
    expect(() => createTestnetApprovalPlan({ ...input, ...change }, now)).toThrow();
  });
});

function reader(overrides: Record<string, unknown> = {}) {
  const reads: { functionName: string; blockNumber: bigint }[] = [];
  const writes = vi.fn(() => { throw new Error("WRITE PATH REACHED"); });
  const client = {
    getChainId: vi.fn(async () => 5042002),
    getBlock: vi.fn(async () => ({ number: 100n, hash: `0x${"11".repeat(32)}` as `0x${string}`, timestamp: 1792151940n })),
    getCode: vi.fn(async () => "0x1234" as `0x${string}`),
    readContract: vi.fn(async (request: { functionName: string; blockNumber: bigint }) => {
      reads.push(request);
      const values: Record<string, unknown> = { getOwners: input.expectedSafeOwners, getThreshold: 2n, isModuleEnabled: false, safe: input.safe, token: input.token, reserve: addr(0), policyEpoch: 0n, totalSpent: 0n, paused: true, executor: addr(0), verifier: addr(0), decimals: 6 };
      return request.functionName in overrides ? overrides[request.functionName] : values[request.functionName];
    }),
    writeContract: writes, sendTransaction: writes, signTransaction: writes, simulateContract: writes,
  };
  return { client, reads, writes };
}

describe("read-only finalized testnet preflight", () => {
  it("checks the exact finalized snapshot, rechecks RPC identity and grants no approval", async () => {
    const { client, reads, writes } = reader();
    const result = await probeTestnetApproval(input, client, now);
    expect(result).toMatchObject({ status: "READ_ONLY_MATCH", executionEnabled: false, mainnetEnabled: false, ownerConsent: false, providerSecurityApproval: false, independentSecurityApproval: false, protected: false, finalizedBlockNumber: "100", planHash: createTestnetApprovalPlan(input, now).planHash });
    expect(client.getChainId).toHaveBeenCalledTimes(2);
    expect(reads.every((r) => r.blockNumber === 100n)).toBe(true);
    expect(client.getCode.mock.calls.length).toBe(4);
    expect(writes).not.toHaveBeenCalled();
    expect(result.limitations.join(" ")).toMatch(/does not prove Circle provider ownership/);
  });
  it.each([
    ["owners", { getOwners: [addr(60), addr(80)] }], ["threshold", { getThreshold: 1n }],
    ["Safe binding", { safe: addr(80) }], ["token binding", { token: addr(80) }],
    ["reserve binding", { reserve: addr(80) }], ["existing authority", { policyEpoch: 1n }],
    ["spent module", { totalSpent: 1n }], ["unpaused module", { paused: false }],
    ["existing executor", { executor: addr(80) }], ["already enabled module", { isModuleEnabled: true }],
    ["wrong decimals", { decimals: 18 }],
  ])("rejects %s mismatch", async (_label, overrides) => {
    const { client, writes } = reader(overrides);
    await expect(probeTestnetApproval(input, client, now)).rejects.toThrow();
    expect(writes).not.toHaveBeenCalled();
  });
  it("rejects missing contract code, unavailable finality and switched RPC chains", async () => {
    const missing = reader(); missing.client.getCode.mockResolvedValue("0x");
    await expect(probeTestnetApproval(input, missing.client, now)).rejects.toThrow();
    const absent = reader(); absent.client.getBlock.mockResolvedValue({ number: null, hash: null, timestamp: 0n } as never);
    await expect(probeTestnetApproval(input, absent.client, now)).rejects.toThrow();
    const switched = reader(); switched.client.getChainId.mockResolvedValueOnce(5042002).mockResolvedValueOnce(1);
    await expect(probeTestnetApproval(input, switched.client, now)).rejects.toThrow(/chain/i);
    const wrong = reader(); wrong.client.getChainId.mockResolvedValue(1);
    await expect(probeTestnetApproval(input, wrong.client, now)).rejects.toThrow(/chain/i);
    expect(wrong.client.readContract).not.toHaveBeenCalled();
  });
  it("rejects expiry reached while asynchronous RPC reads are in flight", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { client } = reader();
    client.getChainId.mockImplementationOnce(async () => 5042002).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(input.expiresAt)); return 5042002;
    });
    await expect(probeTestnetApproval(input, client)).rejects.toThrow(/expiry/i);
  });
});

const exec = promisify(execFile);
const cliWithEnv = (args: string[], env: Record<string, string> = {}) => exec(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/testnet-plan.ts", ...args], { cwd: process.cwd(), env: { ...process.env, SOURCE_RPC_URL: "", ARC_RPC_URL: "", ...env } });
const cli = (...args: string[]) => cliWithEnv(args);
const currentInput = () => ({ ...input, expiresAt: new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"), workerStopAt: new Date(Date.now() + 7_200_000).toISOString().replace(/\.\d{3}Z$/, "Z") });
describe("private offline CLI artifacts", () => {
  it("prints safe help and writes new private unsigned artifacts without RPC configuration", async () => {
    const help = await cli("--help"); expect(help.stdout).toMatch(/--input/); expect(help.stdout).toMatch(/unsigned/i);
    const dir = await mkdtemp(join(tmpdir(), "countersign-approval-")); cleanup.push(dir);
    const file = join(dir, "input.json"), out = join(dir, "plan");
    await writeFile(file, JSON.stringify(currentInput()), { mode: 0o600 });
    await cli("--input", file, "--out", out);
    expect((await stat(out)).mode & 0o777).toBe(0o700);
    expect((await stat(join(out, "plan.json"))).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(await readFile(join(out, "plan.json"), "utf8"));
    expect(saved).toMatchObject({ unsigned: true, executionEnabled: false, mainnetEnabled: false });
    await expect(cli("--input", file, "--out", out)).rejects.toThrow();
    expect(JSON.parse(await readFile(join(out, "plan.json"), "utf8"))).toEqual(saved);
    await expect(cli("--input", file, "--out", join(process.cwd(), "must-not-create-plan"))).rejects.toThrow();
  });
  it("rejects oversized/secret input and hides source error data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "countersign-approval-")); cleanup.push(dir);
    const file = join(dir, "input.json");
    await writeFile(file, JSON.stringify({ ...input, privateKey: "SECRET_SENTINEL" }), { mode: 0o600 });
    try { await cli("--input", file, "--out", join(dir, "bad")); throw new Error("expected rejection"); }
    catch (error) { expect((error as { stderr?: string }).stderr).not.toContain("SECRET_SENTINEL"); expect((error as { stderr?: string }).stderr).toMatch(/failed/i); }
    await writeFile(file, " ".repeat(65537));
    await expect(cli("--input", file, "--out", join(dir, "large"))).rejects.toThrow();
  });
  it("rejects symlink inputs and parent-path aliases into the application repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "countersign-approval-")); cleanup.push(dir);
    const file = join(dir, "input.json"), alias = join(dir, "app-alias"), inputAlias = join(dir, "input-alias.json");
    await writeFile(file, JSON.stringify(currentInput()), { mode: 0o600 });
    await symlink(process.cwd(), alias); await symlink(file, inputAlias);
    await expect(cli("--input", inputAlias, "--out", join(dir, "linked-input"))).rejects.toThrow();
    await expect(cli("--input", file, "--out", join(alias, "must-not-create-plan"))).rejects.toThrow();
    await expect(stat(join(alias, "must-not-create-plan"))).rejects.toThrow();
  });
  it("does not echo an invalid RPC URL, credential, raw error or input body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "countersign-approval-")); cleanup.push(dir);
    const file = join(dir, "input.json"); await writeFile(file, JSON.stringify(currentInput()), { mode: 0o600 });
    try {
      await cliWithEnv(["--input", file, "--out", join(dir, "bad-rpc"), "--probe"], { SOURCE_RPC_URL: "SECRET_RPC_URL_SENTINEL" });
      throw new Error("expected rejection");
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr;
      expect(stderr).toMatch(/failed/i); expect(stderr).not.toMatch(/SECRET_RPC_URL_SENTINEL|TypeError|at main|organizationId|5042002/);
    }
    await expect(stat(join(dir, "bad-rpc"))).rejects.toThrow();
  });
});
