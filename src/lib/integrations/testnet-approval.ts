import { z } from "zod";
import { encodeFunctionData, keccak256, parseAbi, stringToHex, zeroAddress, type Abi, type Address, type Hex } from "viem";
import { assertTestnetExecutionNetwork, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_CIRCLE_CHAIN, ARC_TESTNET_USDC, ARC_TESTNET_USDC_DECIMALS } from "./execution-network";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v.toLowerCase() as Address);
const atomic = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine((v) => BigInt(v) < 2n ** 256n, "Amount exceeds uint256");
const date = z.string().datetime({ offset: true }).refine((v) => Date.parse(v) % 1000 === 0, "Contract times must use whole seconds").transform((v) => new Date(v).toISOString());
const recordId = z.string().min(1).max(256).refine((v) => v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v), "Invalid public record identity");

/** Public identities only. Keys, sessions, RPC URLs and approval claims are not input fields. */
export const testnetApprovalInputSchema = z.object({
  schemaVersion: z.literal(1), organizationId: z.string().uuid(),
  chainId: z.literal(ARC_TESTNET_CHAIN_ID), sourceChainId: z.literal(ARC_TESTNET_CHAIN_ID), destinationChainId: z.literal(ARC_TESTNET_CHAIN_ID),
  circleChain: z.literal(ARC_TESTNET_CIRCLE_CHAIN), testnet: z.literal(true),
  token: address.refine((v) => v === ARC_TESTNET_USDC, "Canonical Arc testnet USDC required"), tokenDecimals: z.literal(ARC_TESTNET_USDC_DECIMALS),
  safe: address, module: address, circleExecutor: address, verifier: address, recipient: address,
  expectedSafeOwners: z.array(address).min(1).max(32), expectedSafeThreshold: z.number().int().min(1).max(32),
  engagementId: recordId, engagementVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), obligationId: recordId,
  amountAtomic: atomic.refine((v) => BigInt(v) > 0n && BigInt(v) <= 1_000_000n, "First proof is capped at 1 test USDC"),
  cashFloorAtomic: atomic, expiresAt: date, workerStopAt: date,
  funding: z.object({ from: address }).strict().optional(),
}).strict();
export type TestnetApprovalInput = z.infer<typeof testnetApprovalInputSchema>;

// These signatures mirror contracts/src/CountersignModule.sol. Tests decode the
// generated calldata with ABI declarations read from Solidity, independently of these declarations.
const moduleAbi = parseAbi([
  "function configure(address executor_,address verifier_,(uint256 perPayment,uint256 rolling24h,uint256 lifetime,uint256 cashFloor,uint64 validUntil,bool coveredOnly) p)",
  "function setEngagement(bytes32 id,(uint64 version,address recipient,uint256 destinationChainId,uint256 perPayment,uint256 rolling24h,uint256 lifetime,bool active) e)",
  "function setObligation(bytes32 id,bytes32 engagementId,uint256 cap)",
  "function pause()", "function revoke()",
  "function safe() view returns (address)", "function token() view returns (address)", "function reserve() view returns (address)",
  "function executor() view returns (address)", "function verifier() view returns (address)",
  "function policyEpoch() view returns (uint256)", "function totalSpent() view returns (uint256)", "function paused() view returns (bool)",
]);
const safeAbi = parseAbi(["function enableModule(address module)", "function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function isModuleEnabled(address module) view returns (bool)"]);
const tokenAbi = parseAbi(["function transfer(address to,uint256 amount) returns (bool)", "function decimals() view returns (uint8)"]);
const disclaimers = {
  unsigned: true as const, executionEnabled: false as const, mainnetEnabled: false as const,
  ownerConsent: false as const, independentSecurityApproval: false as const, providerSecurityApproval: false as const,
};
const limitations = [
  "This unsigned proposal creates no owner consent, signed permit, deployment approval or active authority. Every call needs separate owner review and execution outside this tool.",
  "The provider security gate remains blocked. Neither generation nor RPC reads approve the unresolved Circle dependencies or independently review security.",
  "Only direct canonical USDC on Arc testnet is proposed. Mainnet and cross-chain execution are disabled.",
  "The module has zero reserve and coveredOnly=false: this first proof is unprotected and creates no coverage or reimbursement promise.",
  "configure unpauses the module and changes authority. It is deliberately last; all setup calls and exact current policy epoch must be independently read back before any separately approved payment.",
  "Funding is an optional separate approval, not a setup action. Exact-amount funding may still be insufficient when cashFloorAtomic is positive; this tool never increases the proposed funding amount.",
  "Circle custom spending policies are mainnet-only and are not available for this testnet plan. Deployed Countersign controls require separate verification.",
  "Pause and revoke are Safe-owner operations. A database flag does not revoke on-chain authority, and revocation cannot reverse an already executed payment.",
  "Expected Safe owners and threshold are proposals until compared with finalized chain state; these addresses do not establish independent custody or recoverability.",
];

function validatedInput(raw: unknown, now: Date) {
  const input = testnetApprovalInputSchema.parse(raw);
  assertTestnetExecutionNetwork(input);
  const expires = Date.parse(input.expiresAt), stop = Date.parse(input.workerStopAt), time = now.getTime();
  if (!Number.isFinite(time) || expires <= time || expires > time + 86_400_000 || expires > stop)
    throw new Error("Expiry must be future, within 24 hours, and no later than the explicit worker stop");
  const roles = [input.safe, input.module, input.token, input.circleExecutor, input.verifier, input.recipient];
  const invalid = (v: string) => v === zeroAddress || v === "0x0000000000000000000000000000000000000001";
  if (roles.some(invalid) || new Set(roles).size !== roles.length)
    throw new Error("Zero, sentinel or colliding administrative addresses are prohibited");
  const owners = input.expectedSafeOwners;
  if (new Set(owners).size !== owners.length || input.expectedSafeThreshold > owners.length || owners.some((v) => invalid(v) || roles.slice(0, 5).includes(v)))
    throw new Error("Expected Safe owners must be unique, valid and separate from executor, verifier and contract addresses");
  if (input.funding && (invalid(input.funding.from) || roles.slice(0, 5).includes(input.funding.from)))
    throw new Error("Funding source must be separate from administrative contracts and signing roles");
  return input;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

export function createTestnetApprovalPlan(raw: unknown, now = new Date()) {
  const input = validatedInput(raw, now), amount = BigInt(input.amountAtomic);
  const engagementId = keccak256(stringToHex(input.engagementId)), obligationId = keccak256(stringToHex(input.obligationId));
  const call = (to: Address, functionName: string, data: Hex) => ({ from: input.safe, to, value: "0", operation: 0 as const, functionName, data, unsigned: true as const, approvalRequired: "Safe owners must independently review and approve" });
  const body = {
    schemaVersion: 1, kind: "UNSIGNED_TESTNET_OWNER_APPROVAL_PLAN", ...disclaimers,
    createdAt: now.toISOString(), inputs: input,
    identityBindings: { engagementId, obligationId, method: "keccak256(UTF-8 exact application record ID), matching server authorization" },
    setupCalls: [
      call(input.safe, "enableModule", encodeFunctionData({ abi: safeAbi, functionName: "enableModule", args: [input.module] })),
      call(input.module, "setEngagement", encodeFunctionData({ abi: moduleAbi, functionName: "setEngagement", args: [engagementId, { version: BigInt(input.engagementVersion), recipient: input.recipient, destinationChainId: BigInt(input.destinationChainId), perPayment: amount, rolling24h: amount, lifetime: amount, active: true }] })),
      call(input.module, "setObligation", encodeFunctionData({ abi: moduleAbi, functionName: "setObligation", args: [obligationId, engagementId, amount] })),
      call(input.module, "configure", encodeFunctionData({ abi: moduleAbi, functionName: "configure", args: [input.circleExecutor, input.verifier, { perPayment: amount, rolling24h: amount, lifetime: amount, cashFloor: BigInt(input.cashFloorAtomic), validUntil: BigInt(Date.parse(input.expiresAt) / 1000), coveredOnly: false }] })),
    ],
    expectedPolicyEpochAfterSetup: "3",
    fundingProposal: input.funding ? { from: input.funding.from, to: input.token, value: "0", operation: 0 as const, functionName: "transfer", data: encodeFunctionData({ abi: tokenAbi, functionName: "transfer", args: [input.safe, amount] }), unsigned: true as const, separateApprovalRequired: true as const, amountAtomic: input.amountAtomic, approvalRequired: "Separate funding-source approval; never part of automatic setup" } : null,
    recoveryCalls: [call(input.module, "pause", encodeFunctionData({ abi: moduleAbi, functionName: "pause" })), call(input.module, "revoke", encodeFunctionData({ abi: moduleAbi, functionName: "revoke" }))],
    limitations, hashSpecification: "keccak256 of UTF-8 JSON of the entire plan excluding planHash; recursively sorted object keys; array order preserved; no whitespace",
  };
  return { ...body, planHash: keccak256(stringToHex(JSON.stringify(canonical(body)))) };
}

/** Deliberately contains only chain reads, with no signing, sending or simulation API. */
export type TestnetApprovalReader = {
  getChainId(): Promise<number>;
  getBlock(input: { blockTag: "finalized" }): Promise<{ number: bigint | null; hash: Hex | null; timestamp: bigint }>;
  getCode(input: { address: Address; blockNumber: bigint }): Promise<Hex | undefined>;
  readContract(input: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; blockNumber: bigint }): Promise<unknown>;
};

export async function probeTestnetApproval(raw: unknown, reader: TestnetApprovalReader, fixedNow?: Date) {
  const now = fixedNow ?? new Date();
  const plan = createTestnetApprovalPlan(raw, now), input = plan.inputs;
  const assertChain = async () => { if (await reader.getChainId() !== ARC_TESTNET_CHAIN_ID) throw new Error("RPC chain differs from Arc testnet"); };
  await assertChain();
  const finalized = await reader.getBlock({ blockTag: "finalized" });
  if (typeof finalized.number !== "bigint" || finalized.number < 0n || !finalized.hash || !/^0x[0-9a-fA-F]{64}$/.test(finalized.hash) || typeof finalized.timestamp !== "bigint" || finalized.timestamp <= 0n || finalized.timestamp > BigInt(Math.floor(now.getTime() / 1000)))
    throw new Error("A valid finalized block is required");
  const blockNumber = finalized.number;
  const contracts = [input.safe, input.module, input.token, input.circleExecutor];
  const codes = await Promise.all(contracts.map((a) => reader.getCode({ address: a, blockNumber })));
  if (codes.some((code) => !code || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code))) throw new Error("Safe, module, token and Circle SCA contract code must be present");
  const read = (a: Address, abi: Abi, functionName: string, args?: readonly unknown[]) => reader.readContract({ address: a, abi, functionName, ...(args ? { args } : {}), blockNumber });
  const [ownersRaw, threshold, enabled, safe, token, reserve, epoch, spent, paused, executor, verifier, decimals] = await Promise.all([
    read(input.safe, safeAbi, "getOwners"), read(input.safe, safeAbi, "getThreshold"), read(input.safe, safeAbi, "isModuleEnabled", [input.module]),
    ...["safe", "token", "reserve", "policyEpoch", "totalSpent", "paused", "executor", "verifier"].map((name) => read(input.module, moduleAbi, name)),
    read(input.token, tokenAbi, "decimals"),
  ]);
  const owners = z.array(address).min(1).max(32).parse(ownersRaw);
  const same = (actual: unknown, expected: Address) => typeof actual === "string" && actual.toLowerCase() === expected;
  if (new Set(owners).size !== owners.length || owners.length !== input.expectedSafeOwners.length || owners.some((o) => !input.expectedSafeOwners.includes(o)) || threshold !== BigInt(input.expectedSafeThreshold))
    throw new Error("Finalized Safe owners or threshold do not match the proposal");
  if (enabled !== false || !same(safe, input.safe) || !same(token, input.token) || !same(reserve, zeroAddress) || epoch !== 0n || spent !== 0n || paused !== true || !same(executor, zeroAddress) || !same(verifier, zeroAddress) || decimals !== ARC_TESTNET_USDC_DECIMALS)
    throw new Error("Finalized module/token state does not match a fresh unprotected testnet setup");
  await assertChain();
  // A fixed clock supports offline reproducibility; ordinary callers recheck live time.
  validatedInput(input, fixedNow ?? new Date());
  return {
    schemaVersion: 1, status: "READ_ONLY_MATCH", ...disclaimers, protected: false,
    planHash: plan.planHash, observedAt: now.toISOString(), chainId: ARC_TESTNET_CHAIN_ID,
    finalizedBlockNumber: blockNumber.toString(), finalizedBlockHash: finalized.hash, finalizedBlockTimestamp: finalized.timestamp.toString(),
    codeHashes: Object.fromEntries(contracts.map((a, i) => [a, keccak256(codes[i]!)])),
    expectedSafeOwners: input.expectedSafeOwners, expectedSafeThreshold: input.expectedSafeThreshold,
    limitations: [
      "SCA code presence does not prove Circle provider ownership, custody, supported compatibility, session renewal or recovery.",
      "Zero reserve means this proposal is unprotected. These reads provide no provider or independent security approval and no owner consent.",
      "Bytecode hashes record the observed code; they do not establish reviewed provenance or correctness. A finalized snapshot is not a guarantee that current authority cannot change.",
      "No signature, send, transaction simulation, wallet/provider API request or funding action is performed by this preflight.",
    ],
  };
}
