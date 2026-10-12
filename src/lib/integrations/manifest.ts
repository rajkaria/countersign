import { readFile } from "node:fs/promises";
import { z } from "zod";
import { keccak256, type Address } from "viem";
import { chainClient } from "./chain";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const date = z.string().datetime({ offset: true });
export const deploymentManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    organizationId: z.string().uuid(),
    chainId: z.number().int().positive(),
    safe: address,
    module: address,
    token: address,
    tokenDecimals: z.number().int().min(0).max(36),
    moduleCodeHash: hash,
    circleWallet: address,
    circleChain: z.string().min(1),
    verifier: address,
    verifiedAt: date,
    expiresAt: date,
    compatibility: z.object({
      cliVersion: z.string().min(1),
      moduleExecutionTransaction: hash,
      revocationTransaction: hash,
      renewalEvidenceHash: hash,
    }),
    securityReview: z.object({
      reviewer: z.string().min(1),
      reportHash: hash,
      approvedAt: date,
    }),
    testnet: z.boolean(),
  })
  .strict();
export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;
/** Recheck cached evidence whenever new work is authorized or submitted. Expiry never erases existing operations. */
function assertManifestDates(m: DeploymentManifest, purpose: "execution" | "reconciliation") {
  const now = Date.now();
  const expires = Date.parse(m.expiresAt),
    verified = Date.parse(m.verifiedAt),
    approved = Date.parse(m.securityReview.approvedAt);
  if (
    ![expires, verified, approved].every(Number.isFinite) ||
    (purpose === "execution" && expires <= now) ||
    verified > now ||
    approved > now
  )
    throw new Error("Deployment evidence is stale or future-dated");
}
export function assertCurrentDeploymentManifest(m: DeploymentManifest) {
  assertManifestDates(m, "execution");
}
/** A manifest is an operator-approved evidence bundle, not a self-certifying audit. Verify current bytecode/chain separately. */
export async function loadDeploymentManifest(options: { purpose?: "execution" | "reconciliation" } = {}): Promise<DeploymentManifest | null> {
  const path = process.env.EXECUTION_MANIFEST_PATH;
  const inline = process.env.EXECUTION_MANIFEST_JSON;
  if (!path && !inline) return null;
  const raw = inline ?? (await readFile(path!, "utf8"));
  if (raw.length > 64_000) throw new Error("Deployment manifest too large");
  const m = deploymentManifestSchema.parse(JSON.parse(raw));
  assertManifestDates(m, options.purpose ?? "execution");
  return m;
}
export async function verifyDeploymentManifest(
  m: DeploymentManifest,
  rpcUrl: string,
  options: { purpose?: "execution" | "reconciliation" } = {},
) {
  const purpose = options.purpose ?? "execution";
  assertManifestDates(m, purpose);
  const client = chainClient(rpcUrl);
  if ((await client.getChainId()) !== m.chainId)
    throw new Error("Manifest chain does not match RPC");
  const [code, submission, revocation, finalized] = await Promise.all([
    client.getCode({ address: m.module as Address }),
    client.getTransactionReceipt({
      hash: m.compatibility.moduleExecutionTransaction as `0x${string}`,
    }),
    client.getTransactionReceipt({
      hash: m.compatibility.revocationTransaction as `0x${string}`,
    }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  if (
    !code ||
    keccak256(code) !== m.moduleCodeHash ||
    finalized.number === null ||
    [submission, revocation].some(
      (r) => r.status !== "success" || r.blockNumber > finalized.number,
    )
  )
    throw new Error(
      "Deployment bytecode or finalized evidence does not match manifest",
    );
  assertManifestDates(m, purpose);
  return {
    verified: true,
    limitations: [
      "Transaction success does not by itself establish all compatibility/revocation semantics; review the recorded test evidence.",
      ...(purpose === "reconciliation" ? ["Identity evidence is for reconciling existing operations only; every new authorization and submission still requires unexpired execution evidence."] : []),
    ],
  };
}
