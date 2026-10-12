import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  decodeEventLog,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { moduleAbi, permitDigest, type ModulePermit } from "./module";
export const safeAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function isModuleEnabled(address) view returns (bool)",
]);
const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_USDC_SYSTEM_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe" as Address;
// Official arc-node v0.7.1 activation: pre-Zero5 testnet used different native events.
const ARC_TESTNET_ZERO5_TIMESTAMP = 1779894517n;
const ARC_NATIVE_TO_ERC20_SCALE = 10n ** 12n;
export function chainClient(rpcUrl: string) {
  const url = new URL(rpcUrl);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid RPC endpoint");
  return createPublicClient({
    transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
}
export async function readSafe(input: {
  rpcUrl: string;
  chainId: number;
  safe: Address;
  token: Address;
  module?: Address;
  historyBlocks?: number;
}) {
  const client = chainClient(input.rpcUrl);
  const actual = await client.getChainId();
  if (actual !== input.chainId) throw new Error("RPC chain mismatch");
  const arcUsdc = [5042, 5042002].includes(actual) && input.token.toLowerCase() === ARC_USDC;
  const block = await client.getBlock({ blockTag: "finalized" });
  if (block.number === null) throw new Error("Finalized block unavailable");
  const common = {
    address: input.safe,
    abi: safeAbi,
    blockNumber: block.number,
  };
  const [code, owners, threshold, nonce, balance, decimals, moduleEnabled] =
    await Promise.all([
      client.getCode({ address: input.safe, blockNumber: block.number }),
      client.readContract({ ...common, functionName: "getOwners" }),
      client.readContract({ ...common, functionName: "getThreshold" }),
      client.readContract({ ...common, functionName: "nonce" }),
      client.readContract({
        address: input.token,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [input.safe],
        blockNumber: block.number,
      }),
      client.readContract({
        address: input.token,
        abi: tokenAbi,
        functionName: "decimals",
        blockNumber: block.number,
      }),
      input.module
        ? client.readContract({
            ...common,
            functionName: "isModuleEnabled",
            args: [input.module],
          })
        : Promise.resolve(false),
    ]);
  if (
    !code ||
    code === "0x" ||
    !owners.length ||
    threshold < 1n ||
    threshold > BigInt(owners.length)
  )
    throw new Error(
      "Contract does not expose a valid Safe owner configuration",
    );
  const historyBlocks = input.historyBlocks ?? 1000;
  if (
    !Number.isInteger(historyBlocks) ||
    historyBlocks < 1 ||
    historyBlocks > 10_000
  )
    throw new Error("Invalid bounded history window");
  const start =
    block.number > BigInt(historyBlocks)
      ? block.number - BigInt(historyBlocks)
      : 0n;
  if (arcUsdc) {
    if (decimals !== 6) throw new Error("Arc USDC ERC20 interface must have 6 decimals");
    if (actual === 5042002) {
      const first = await client.getBlock({ blockNumber: start });
      if (first.timestamp < ARC_TESTNET_ZERO5_TIMESTAMP)
        throw new Error("Arc testnet historical native events require independent historical reconciliation; select a post-Zero5 observation window.");
    }
  }
  // Arc's system stream includes native sends and ERC20 interface movements once.
  // Reading both streams would double-count ERC20 transfers and still miss native-only sends in an ERC20-only scan.
  const emitter = arcUsdc ? ARC_USDC_SYSTEM_EMITTER : input.token;
  const [outgoing, incoming] = await Promise.all([
    client.getLogs({
      address: emitter,
      event: transferEvent,
      args: { from: input.safe },
      fromBlock: start,
      toBlock: block.number,
    }),
    client.getLogs({
      address: emitter,
      event: transferEvent,
      args: { to: input.safe },
      fromBlock: start,
      toBlock: block.number,
    }),
  ]);
  let incrementalHistoryComplete = true;
  const transfers = [...new Map(
    [...outgoing, ...incoming].map((log) => [`${log.transactionHash}:${log.logIndex}`, log] as const),
  ).values()].map((log) => {
    const { from, to, value } = log.args;
    if (
      log.address.toLowerCase() !== emitter.toLowerCase() || log.removed ||
      !log.transactionHash || !/^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) ||
      log.logIndex === null || !Number.isInteger(log.logIndex) || log.logIndex < 0 ||
      log.blockNumber === null || log.blockNumber < start || log.blockNumber > block.number! ||
      !from || !to || !/^0x[0-9a-fA-F]{40}$/.test(from) || !/^0x[0-9a-fA-F]{40}$/.test(to) ||
      typeof value !== "bigint" || value < 0n ||
      (from.toLowerCase() !== input.safe.toLowerCase() && to.toLowerCase() !== input.safe.toLowerCase())
    ) throw new Error("Invalid or non-finalized transfer history; reconcile before automation.");
    const debit = from.toLowerCase() === input.safe.toLowerCase();
    const fractional = arcUsdc && value % ARC_NATIVE_TO_ERC20_SCALE !== 0n;
    // A rounded native debit must never automatically match an exact Countersign principal.
    if (fractional && debit) incrementalHistoryComplete = false;
    const amount = arcUsdc
      ? (value + (debit ? ARC_NATIVE_TO_ERC20_SCALE - 1n : 0n)) / ARC_NATIVE_TO_ERC20_SCALE
      : value;
    return {
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      from,
      to,
      amount: amount.toString(),
      block: log.blockNumber.toString(),
      ...(arcUsdc ? { nativeAmount: value.toString(), nativeDecimals: 18, amountRounding: fractional ? debit ? "up" : "down" : "exact" } : {}),
    };
  });
  return {
    safe: input.safe,
    chainId: actual,
    owners,
    threshold: threshold.toString(),
    nonce: nonce.toString(),
    balance: balance.toString(),
    decimals,
    moduleEnabled,
    observedAt: new Date().toISOString(),
    finalizedBlock: block.number.toString(),
    finalizedBlockHash: block.hash,
    historyFrom: start.toString(),
    historyComplete: false,
    incrementalHistoryComplete,
    transfers,
    limitations: [
      "Bounded finalized transfer history; reconcile earlier statements before automation.",
      "Safe-like ABI observation is not independent contract bytecode verification.",
      ...(arcUsdc ? [
        "Arc native/system USDC transfers retain 18-decimal amounts; outgoing principal units round up and incoming units round down to the 6-decimal ERC20 view. Fractional outgoing transfers require independent reconciliation.",
        "Arc gas fees and block rewards are not Transfer logs; reconcile fees from transaction receipts and native balance statements. The ERC20 balance is a conservative truncated view.",
      ] : []),
    ],
  };
}
export async function checkModuleDeployment(input: {
  rpcUrl: string;
  permit: ModulePermit;
  executor: Address;
}) {
  const client = chainClient(input.rpcUrl),
    p = input.permit;
  if ((await client.getChainId()) !== Number(p.chainId))
    throw new Error("Module RPC chain mismatch");
  const call = {
    address: p.module as Address,
    abi: moduleAbi,
    blockTag: "latest" as const,
  };
  const [code, paused, epoch, executor, safe, token, enabled] =
    await Promise.all([
      client.getCode({ address: p.module as Address }),
      client.readContract({ ...call, functionName: "paused" }),
      client.readContract({ ...call, functionName: "policyEpoch" }),
      client.readContract({ ...call, functionName: "executor" }),
      client.readContract({ ...call, functionName: "safe" }),
      client.readContract({ ...call, functionName: "token" }),
      client.readContract({
        address: p.safe as Address,
        abi: safeAbi,
        functionName: "isModuleEnabled",
        args: [p.module as Address],
      }),
    ]);
  if (
    !code ||
    code === "0x" ||
    paused ||
    !enabled ||
    epoch !== BigInt(p.policyEpoch) ||
    String(executor).toLowerCase() !== input.executor.toLowerCase() ||
    String(safe).toLowerCase() !== p.safe.toLowerCase() ||
    String(token).toLowerCase() !== p.token.toLowerCase()
  )
    throw new Error("Current on-chain authority does not match the permit");
  return { valid: true, permitDigest: permitDigest(p) };
}
/** Requires matching module event at a finalized source block, not just a successful arbitrary transaction. */
export async function verifySourceSettlement(input: {
  rpcUrl: string;
  transaction: Hex;
  permit: ModulePermit;
}) {
  const client = chainClient(input.rpcUrl);
  if ((await client.getChainId()) !== Number(input.permit.sourceChainId))
    throw new Error("Source chain mismatch");
  const [receipt, finalized] = await Promise.all([
    client.getTransactionReceipt({ hash: input.transaction }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  if (
    receipt.status !== "success" ||
    finalized.number === null ||
    receipt.blockNumber > finalized.number
  )
    throw new Error("Source is not finalized successfully");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new Error("Source receipt was reorganized");
  const matching = receipt.logs
    .filter(
      (l) => l.address.toLowerCase() === input.permit.module.toLowerCase(),
    )
    .some((log) => {
      try {
        const decoded = decodeEventLog({
          abi: moduleAbi,
          data: log.data,
          topics: log.topics,
          eventName: "PaymentExecuted",
        });
        const a = decoded.args as unknown as {
          paymentId: string;
          permitDigest: string;
          recipient: string;
          amount: bigint;
          route: string;
          destinationConfirmed: boolean;
        };
        return (
          a.paymentId === input.permit.paymentId &&
          a.permitDigest === permitDigest(input.permit) &&
          a.recipient.toLowerCase() === input.permit.recipient.toLowerCase() &&
          a.amount === BigInt(input.permit.amount) &&
          a.route === input.permit.route &&
          a.destinationConfirmed ===
            (input.permit.sourceChainId === input.permit.destinationChainId)
        );
      } catch {
        return false;
      }
    });
  if (!matching)
    throw new Error("Matching Countersign payment event not found");
  return {
    finalized: true,
    transaction: input.transaction,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber.toString(),
    crossChain: input.permit.sourceChainId !== input.permit.destinationChainId,
  };
}
export const DIRECT_ROUTE = keccak256(stringToHex("DIRECT_ERC20_V1"));
export const CCTP_ROUTE = keccak256(stringToHex("CCTP_V2_STANDARD_V1"));
