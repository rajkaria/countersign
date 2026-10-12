import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256 } from "viem";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
  type DeploymentManifest,
} from "../../src/lib/integrations/manifest";

const { client, chainClient } = vi.hoisted(() => {
  const client = {
    getChainId: vi.fn(),
    getCode: vi.fn(),
    getTransactionReceipt: vi.fn(),
    getBlock: vi.fn(),
  };
  return { client, chainClient: vi.fn(() => client) };
});
vi.mock("../../src/lib/integrations/chain", () => ({ chainClient }));
const manifest: DeploymentManifest = {
  schemaVersion: 1,
  organizationId: "11111111-1111-4111-8111-111111111111",
  chainId: 5042002,
  safe: "0x" + "11".repeat(20),
  module: "0x" + "22".repeat(20),
  token: "0x3600000000000000000000000000000000000000",
  tokenDecimals: 6,
  moduleCodeHash: keccak256("0x1234"),
  circleWallet: "0x" + "33".repeat(20),
  circleChain: "ARC-TESTNET",
  verifier: "0x" + "44".repeat(20),
  verifiedAt: "2026-10-12T00:00:00Z",
  expiresAt: "2026-10-14T00:00:00Z",
  compatibility: {
    cliVersion: "1.1.4",
    moduleExecutionTransaction: "0x" + "55".repeat(32),
    revocationTransaction: "0x" + "66".repeat(32),
    renewalEvidenceHash: "0x" + "77".repeat(32),
  },
  securityReview: {
    reviewer: "Independent fixture reviewer",
    reportHash: "0x" + "88".repeat(32),
    approvedAt: "2026-10-12T00:00:00Z",
  },
  testnet: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  vi.clearAllMocks();
  client.getChainId.mockResolvedValue(manifest.chainId);
  client.getCode.mockResolvedValue("0x1234");
  client.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n });
  client.getBlock.mockResolvedValue({ number: 11n });
  vi.stubEnv("EXECUTION_MANIFEST_JSON", JSON.stringify(manifest));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("current deployment evidence at every new submission", () => {
  it("rejects a cached manifest at its exact expiry before any RPC call", async () => {
    const loaded = await loadDeploymentManifest();
    expect(loaded).not.toBeNull();
    vi.setSystemTime(new Date(manifest.expiresAt));
    await expect(verifyDeploymentManifest(loaded!, "https://fixture.invalid")).rejects.toThrow(/stale or future-dated/);
    expect(chainClient).not.toHaveBeenCalled();
  });
  it.each(["verifiedAt", "approvedAt"] as const)("rejects future-dated %s before network access", async (field) => {
    const candidate = structuredClone(manifest);
    if (field === "verifiedAt") candidate.verifiedAt = "2026-10-13T00:00:01Z";
    else candidate.securityReview.approvedAt = "2026-10-13T00:00:01Z";
    await expect(verifyDeploymentManifest(candidate, "https://fixture.invalid")).rejects.toThrow(/stale or future-dated/);
    expect(chainClient).not.toHaveBeenCalled();
  });
  it("rejects evidence that expires while chain verification is in flight", async () => {
    client.getBlock.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(manifest.expiresAt));
      return { number: 11n };
    });
    await expect(verifyDeploymentManifest(manifest, "https://fixture.invalid")).rejects.toThrow(/stale or future-dated/);
  });
  it("accepts current evidence with matching finalized bytecode and receipts", async () => {
    await expect(verifyDeploymentManifest(manifest, "https://fixture.invalid")).resolves.toMatchObject({ verified: true });
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });
  it("allows a restarted worker to read expired identity evidence for reconciliation while new execution stays gated", async () => {
    vi.setSystemTime(new Date(manifest.expiresAt));
    const loaded = await loadDeploymentManifest({ purpose: "reconciliation" });
    expect(loaded).not.toBeNull();
    await expect(verifyDeploymentManifest(loaded!, "https://fixture.invalid", { purpose: "reconciliation" })).resolves.toMatchObject({ verified: true });
    await expect(loadDeploymentManifest()).rejects.toThrow(/stale or future-dated/);
    await expect(verifyDeploymentManifest(loaded!, "https://fixture.invalid")).rejects.toThrow(/stale or future-dated/);
  });
});
