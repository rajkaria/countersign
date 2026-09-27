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
  const [outgoing, incoming] = await Promise.all([
    client.getLogs({
      address: input.token,
      event: transferEvent,
      args: { from: input.safe },
      fromBlock: start,
      toBlock: block.number,
    }),
    client.getLogs({
      address: input.token,
      event: transferEvent,
      args: { to: input.safe },
      fromBlock: start,
      toBlock: block.number,
    }),
  ]);
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
    transfers: [...outgoing, ...incoming].map((log) => ({
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      from: log.args.from,
      to: log.args.to,
      amount: log.args.value?.toString(),
      block: log.blockNumber?.toString(),
    })),
    limitations: [
      "Bounded finalized transfer history; reconcile earlier statements before automation.",
      "Safe-like ABI observation is not independent contract bytecode verification.",
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
