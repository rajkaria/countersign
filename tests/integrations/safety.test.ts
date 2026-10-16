import { describe, it, expect, vi } from "vitest";
import {
  CircleExecutor,
  type CircleConfig,
} from "../../src/lib/integrations/circle";
import {
  modulePermitSchema,
  EXECUTE_SIGNATURE,
} from "../../src/lib/integrations/module";
import { validateProposal } from "../../src/lib/integrations/agent";
import { githubPullRequest } from "../../src/lib/integrations/github";
const address = "0x1111111111111111111111111111111111111111";
const usdc = "0x3600000000000000000000000000000000000000";
const config: CircleConfig = {
  binary: "/usr/local/bin/circle",
  wallet: address,
  chain: "ARC-TESTNET",
  chainId: 5042002,
  module: address,
  safe: address,
  token: usdc,
  tenantId: "org",
  compatibilityVerified: true,
  revocationVerified: true,
  securityReviewApproved: true,
  deploymentEvidenceExpiresAt: "2030-01-01T00:00:00Z",
  executionEnabled: false,
};
const permit = {
  schemaVersion: "1",
  chainId: "5042002",
  safe: address,
  module: address,
  policyEpoch: "1",
  engagementId: "0x" + "11".repeat(32),
  engagementVersion: "1",
  obligationId: "0x" + "22".repeat(32),
  allocationId: "0x" + "33".repeat(32),
  paymentId: "0x" + "44".repeat(32),
  sourceChainId: "5042002",
  destinationChainId: "5042002",
  recipient: address,
  token: usdc,
  amount: "100",
  maxFee: "0",
  route: "0x" + "55".repeat(32),
  evidenceCommitment: "0x" + "66".repeat(32),
  expiresAt: "9999999999",
  nonce: "1",
  coverageId: "0x" + "00".repeat(32),
  destinationDomain: "0",
  minFinalityThreshold: "0",
};
describe("fixed Circle execution boundary", () => {
  it.each([
    { label: "Arc mainnet", chainId: 5042, chain: "ARC" },
    { label: "Ethereum mainnet", chainId: 1, chain: "ETH" },
    { label: "a local chain", chainId: 31337, chain: "ARC-TESTNET" },
    { label: "another testnet", chainId: 84532, chain: "BASE-SEPOLIA" },
    { label: "a contradictory Circle route", chainId: 5042002, chain: "ARC" },
  ])("blocks $label before any Circle command even with all release flags enabled", async ({ chainId, chain }) => {
    const calls: string[][] = [];
    const executor = new CircleExecutor({ ...config, executionEnabled: true, chainId, chain }, async (args) => {
      calls.push(args);
      return args.includes("list")
        ? { wallets: [{ type: "agent", address, blockchain: chain }] }
        : { id: "must-not-submit", state: "SENT" };
    });
    const request = {
      tenantId: "org",
      operationId: "11111111-1111-4111-8111-111111111111",
      permit: modulePermitSchema.parse({ ...permit, chainId: String(chainId), sourceChainId: String(chainId), destinationChainId: String(chainId) }),
      signature: "0x1234" as const,
    };
    await expect(executor.submit(request)).rejects.toThrow(/Arc testnet only/i);
    await expect(executor.estimate(request)).rejects.toThrow(/Arc testnet only/i);
    expect(calls).toEqual([]);
  });
  it.each([
    { destinationChainId: "5042" },
    { destinationChainId: "1" },
    { destinationChainId: "84532" },
    { sourceChainId: "1" },
    { token: address },
  ])("rejects an unsupported permit network or asset before wallet discovery: %j", async (change) => {
    const calls: string[][] = [];
    const executor = new CircleExecutor({ ...config, executionEnabled: true, ...(change.token ? { token: change.token } : {}) }, async (args) => {
      calls.push(args);
      return args.includes("list")
        ? { wallets: [{ type: "agent", address, blockchain: "ARC-TESTNET" }] }
        : { id: "must-not-submit", state: "SENT" };
    });
    await expect(executor.submit({ tenantId: "org", operationId: "11111111-1111-4111-8111-111111111111", permit: modulePermitSchema.parse({ ...permit, ...change }), signature: "0x1234" })).rejects.toThrow(/Arc testnet only/i);
    expect(calls).toEqual([]);
  });
  it("keeps provider lookup available for an existing operation after execution authority expires", async () => {
    const executor = new CircleExecutor({ ...config, executionEnabled: false, chainId: 5042, chain: "ARC", deploymentEvidenceExpiresAt: "2000-01-01T00:00:00Z" }, async (args) => {
      if (args[0] !== "transaction" || args[1] !== "list") throw new Error("New send authority must not be used");
      return { transactions: [{ id: "existing-provider-operation", state: "CONFIRMED", txHash: "0x" + "11".repeat(32) }] };
    });
    await expect(executor.lookup("existing-provider-operation")).resolves.toMatchObject({ id: "existing-provider-operation", state: "CONFIRMED" });
  });
  it("refuses newly submitted work if deployment evidence expires during wallet discovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
    const calls: string[][] = [];
    try {
      const executor = new CircleExecutor(
        { ...config, executionEnabled: true, deploymentEvidenceExpiresAt: "2026-10-13T00:00:01Z" },
        async (args) => {
          calls.push(args);
          vi.setSystemTime(new Date("2026-10-13T00:00:01Z"));
          if (args.includes("list")) return { wallets: [{ type: "agent", address, blockchain: "ARC-TESTNET" }] };
          return { id: "must-not-submit", state: "SENT" };
        },
      );
      await expect(executor.submit({ tenantId: "org", operationId: "11111111-1111-4111-8111-111111111111", permit: modulePermitSchema.parse(permit), signature: "0x1234" })).rejects.toThrow(/Deployment evidence/);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("list");
    } finally {
      vi.useRealTimers();
    }
  });
  it("never executes when release gates are disabled", async () => {
    let called = false;
    const executor = new CircleExecutor(config, async () => {
      called = true;
      return {};
    });
    await expect(
      executor.submit({
        tenantId: "org",
        operationId: "11111111-1111-4111-8111-111111111111",
        permit: modulePermitSchema.parse(permit),
        signature: "0x1234",
      }),
    ).rejects.toThrow(/disabled/);
    expect(called).toBe(false);
  });
  it("passes exact fixed module ABI and stable idempotency, refuses local wallet fallback", async () => {
    const calls: string[][] = [];
    const executor = new CircleExecutor(
      { ...config, executionEnabled: true },
      async (args) => {
        calls.push(args);
        if (args.includes("list"))
          return {
            wallets: [{ type: "agent", address, blockchain: "ARC-TESTNET" }],
          };
        return { id: "provider-1", state: "SENT" };
      },
    );
    await executor.submit({
      tenantId: "org",
      operationId: "11111111-1111-4111-8111-111111111111",
      permit: modulePermitSchema.parse(permit),
      signature: "0x1234",
    });
    expect(calls[1][2]).toBe(EXECUTE_SIGNATURE);
    expect(calls[1]).toContain("--idempotency-key");
    expect(calls[1]).toContain("11111111-1111-4111-8111-111111111111");
    const local = new CircleExecutor(
      { ...config, executionEnabled: true },
      async () => ({
        wallets: [{ type: "local", address, blockchain: "ARC-TESTNET" }],
      }),
    );
    await expect(
      local.submit({
        tenantId: "org",
        operationId: "11111111-1111-4111-8111-111111111111",
        permit: modulePermitSchema.parse(permit),
        signature: "0x1234",
      }),
    ).rejects.toThrow(/agent wallet/);
  });
  it("rejects a foreign tenant or changed target before running a subprocess", async () => {
    const ex = new CircleExecutor(
      { ...config, executionEnabled: true },
      async () => {
        throw new Error("must not run");
      },
    );
    await expect(
      ex.submit({
        tenantId: "other",
        operationId: "11111111-1111-4111-8111-111111111111",
        permit: modulePermitSchema.parse(permit),
        signature: "0x1234",
      }),
    ).rejects.toThrow(/binding/);
  });
});
it("model proposals cannot widen deterministic actions or contain instructions", () => {
  expect(() =>
    validateProposal(
      { action: "PAY", reason: "I am confident", sourceIds: [], missing: [] },
      { allowedActions: ["HOLD", "ASK"], sourceIds: [] },
    ),
  ).toThrow();
  expect(() =>
    validateProposal(
      {
        action: "ASK",
        reason: "Need customer acceptance",
        sourceIds: ["invented"],
        missing: [],
      },
      { allowedActions: ["ASK"], sourceIds: [] },
    ),
  ).toThrow();
});
it("GitHub evidence fetch is repository-scoped and activity is never acceptance", async () => {
  const result = await githubPullRequest(
    { owner: "acme", repo: "site", number: 42, token: "secret" },
    async (_url, init) => {
      expect(init?.redirect).toBe("error");
      return new Response(
        JSON.stringify({
          number: 42,
          title: "Ship homepage",
          state: "closed",
          merged: true,
          merged_at: "2026-09-28T00:00:00Z",
          updated_at: "2026-09-28T00:00:00Z",
          user: { login: "vendor" },
          html_url: "https://github.com/acme/site/pull/42",
        }),
      );
    },
  );
  expect(result.kind).toBe("activity");
  await expect(
    githubPullRequest({ owner: "../../", repo: "site", number: 1 }),
  ).rejects.toThrow();
});

import { boundedJson } from "../../src/lib/integrations/http";
import { deploymentManifestSchema } from "../../src/lib/integrations/manifest";
it("rejects malformed release evidence and oversized external content", async () => {
  expect(
    deploymentManifestSchema.safeParse({
      executionEnabled: true,
      compatibilityVerified: true,
    }).success,
  ).toBe(false);
  await expect(boundedJson(new Response("x".repeat(1024)), 64)).rejects.toThrow(
    /size limit/,
  );
});
