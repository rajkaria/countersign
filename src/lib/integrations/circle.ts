import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  modulePermitSchema,
  permitTuple,
  EXECUTE_SIGNATURE,
  encodedExecution,
  type ModulePermit,
} from "./module";
import type { Hex } from "viem";
const execFileAsync = promisify(execFile);
export type CircleConfig = {
  binary: string;
  wallet: string;
  chain: string;
  chainId: number;
  module: string;
  safe: string;
  token: string;
  tenantId: string;
  compatibilityVerified: boolean;
  revocationVerified: boolean;
  securityReviewApproved: boolean;
  executionEnabled: boolean;
};
export type CircleRequest = {
  tenantId: string;
  operationId: string;
  permit: ModulePermit;
  signature: Hex;
};
export type CircleRunner = (args: string[]) => Promise<unknown>;
const transactionSchema = z
  .object({
    id: z.string().min(1),
    state: z.string().min(1),
    txHash: z.string().optional(),
    transactionHash: z.string().optional(),
  })
  .passthrough();
export class CircleExecutor {
  private run: CircleRunner;
  constructor(
    readonly config: CircleConfig,
    runner?: CircleRunner,
  ) {
    this.run =
      runner ??
      (async (args) => {
        try {
          const result = await execFileAsync(config.binary, args, {
            timeout: 45_000,
            maxBuffer: 1024 * 1024,
            env: {
              NODE_ENV: process.env.NODE_ENV ?? "production",
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              USER: process.env.USER,
              TMPDIR: process.env.TMPDIR,
              CIRCLE_CLI_HOME: process.env.CIRCLE_CLI_HOME,
              CIRCLE_VERSION_CHECK: "off",
              NO_COLOR: "1",
            },
          });
          const parsed = JSON.parse(result.stdout);
          return parsed.data;
        } catch {
          throw new Error(
            "Circle command failed or timed out. Reconcile the existing operation before retrying.",
          );
        }
      });
  }
  private validate(request: CircleRequest, execution: boolean) {
    const p = modulePermitSchema.parse(request.permit),
      c = this.config;
    if (
      execution &&
      (!c.executionEnabled ||
        !c.compatibilityVerified ||
        !c.revocationVerified ||
        !c.securityReviewApproved)
    )
      throw new Error(
        "Circle execution disabled: compatibility, recovery, and security gates must pass.",
      );
    if (
      request.tenantId !== c.tenantId ||
      p.chainId !== String(c.chainId) ||
      p.sourceChainId !== String(c.chainId) ||
      p.module.toLowerCase() !== c.module.toLowerCase() ||
      p.safe.toLowerCase() !== c.safe.toLowerCase() ||
      p.token.toLowerCase() !== c.token.toLowerCase()
    )
      throw new Error("Circle deployment binding mismatch");
    z.string().uuid().parse(request.operationId);
    if (BigInt(p.expiresAt) <= BigInt(Math.floor(Date.now() / 1000)))
      throw new Error("Permit expired");
    encodedExecution(p, request.signature);
    return p;
  }
  async checkAgentWallet() {
    const result = await this.run([
      "wallet",
      "list",
      "--chain",
      this.config.chain,
      "--type",
      "agent",
      "--output",
      "json",
    ]);
    const parsed = z
      .object({
        wallets: z.array(
          z.object({
            type: z.string(),
            address: z.string(),
            blockchain: z.string(),
          }),
        ),
      })
      .parse(result);
    if (
      !parsed.wallets.some(
        (w) =>
          w.type === "agent" &&
          w.address.toLowerCase() === this.config.wallet.toLowerCase() &&
          w.blockchain === this.config.chain,
      )
    )
      throw new Error(
        "Configured Circle agent wallet is unavailable; local EOA fallback is prohibited.",
      );
    return {
      agentWallet: true,
      address: this.config.wallet,
      chain: this.config.chain,
    };
  }
  private args(request: CircleRequest) {
    return [
      "wallet",
      "execute",
      EXECUTE_SIGNATURE,
      JSON.stringify(permitTuple(request.permit)),
      request.signature,
      "--contract",
      this.config.module,
      "--address",
      this.config.wallet,
      "--chain",
      this.config.chain,
      "--amount",
      "0",
      "--idempotency-key",
      request.operationId,
      "--output",
      "json",
    ];
  }
  async estimate(request: CircleRequest) {
    this.validate(request, false);
    await this.checkAgentWallet();
    return this.run([...this.args(request), "--estimate"]);
  }
  async submit(request: CircleRequest) {
    this.validate(request, true);
    await this.checkAgentWallet();
    return transactionSchema.parse(await this.run(this.args(request)));
  }
  async lookup(providerId: string) {
    if (!providerId) throw new Error("Provider transaction ID required");
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const args = [
        "transaction",
        "list",
        "--address",
        this.config.wallet,
        "--chain",
        this.config.chain,
        "--operation",
        "execute",
        "--limit",
        "50",
        "--output",
        "json",
      ];
      if (cursor) args.push("--cursor", cursor);
      const result = await this.run(args);
      const parsed = z
        .object({ transactions: z.array(transactionSchema) })
        .parse(result);
      const found = parsed.transactions.find((t) => t.id === providerId);
      if (found) return found;
      if (parsed.transactions.length < 50) return null;
      cursor = parsed.transactions.at(-1)?.id;
    }
    throw new Error(
      "Provider history exceeds reconciliation page budget; manual reconciliation required",
    );
  }
}
export function circleConfigFromEnv(): CircleConfig {
  return {
    binary: process.env.CIRCLE_CLI_PATH ?? "circle",
    wallet: process.env.CIRCLE_AGENT_WALLET ?? "",
    chain: process.env.CIRCLE_CHAIN ?? "",
    chainId: Number(process.env.SOURCE_CHAIN_ID ?? "0"),
    module: process.env.COUNTERSIGN_MODULE_ADDRESS ?? "",
    safe: process.env.SAFE_ADDRESS ?? "",
    token: process.env.USDC_TOKEN_ADDRESS ?? "",
    tenantId: process.env.EXECUTION_ORGANIZATION_ID ?? "",
    compatibilityVerified: process.env.CIRCLE_COMPATIBILITY_VERIFIED === "true",
    revocationVerified: process.env.CIRCLE_REVOCATION_VERIFIED === "true",
    securityReviewApproved:
      process.env.EXECUTION_SECURITY_REVIEW_APPROVED === "true",
    executionEnabled: process.env.EXECUTION_ENABLED === "true",
  };
}
