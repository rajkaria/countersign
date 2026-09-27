import { decodeEventLog, parseAbiItem, type Hex, type Address } from "viem";
import { z } from "zod";
import { chainClient } from "./chain";
import { boundedJson, type Fetcher } from "./http";
import type { ModulePermit } from "./module";
const receivedEvent = parseAbiItem(
  "event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from,address indexed to,uint256 value)",
);
const word = (data: Hex, start: number, length: number) =>
  `0x${data.slice(2 + start * 2, 2 + (start + length) * 2)}` as Hex;
const uint = (data: Hex, start: number, length: number) =>
  BigInt(word(data, start, length));
export function parseCctpV2Message(message: Hex) {
  if (!/^0x[0-9a-fA-F]+$/.test(message) || message.length !== 2 + 376 * 2)
    throw new Error(
      "Only fixed-length CCTP V2 messages without hooks are supported",
    );
  const body = word(message, 148, 228);
  return {
    version: Number(uint(message, 0, 4)),
    sourceDomain: Number(uint(message, 4, 4)),
    destinationDomain: Number(uint(message, 8, 4)),
    nonce: word(message, 12, 32),
    sender: word(message, 44, 32),
    destinationMessenger: word(message, 76, 32),
    minimumFinality: Number(uint(message, 140, 4)),
    executedFinality: Number(uint(message, 144, 4)),
    body,
    bodyVersion: Number(uint(body, 0, 4)),
    burnToken: word(body, 4, 32),
    recipient: word(body, 36, 32),
    amount: uint(body, 68, 32),
    messageSender: word(body, 100, 32),
    maxFee: uint(body, 132, 32),
    feeExecuted: uint(body, 164, 32),
  };
}
const padded = (address: string) =>
  `0x${address.slice(2).padStart(64, "0")}`.toLowerCase();
export function validateCctpMessage(
  message: Hex,
  input: {
    permit: ModulePermit;
    sourceDomain: number;
    sourceMessenger: Address;
    destinationMessenger: Address;
    sourceAdapter: Address;
  },
) {
  const m = parseCctpV2Message(message),
    p = input.permit;
  if (
    m.version !== 1 ||
    m.bodyVersion !== 1 ||
    m.sourceDomain !== input.sourceDomain ||
    m.destinationDomain !== Number(p.destinationDomain) ||
    m.sender.toLowerCase() !== padded(input.sourceMessenger) ||
    m.destinationMessenger.toLowerCase() !==
      padded(input.destinationMessenger) ||
    m.burnToken.toLowerCase() !== padded(p.token) ||
    m.recipient.toLowerCase() !== padded(p.recipient) ||
    m.messageSender.toLowerCase() !== padded(input.sourceAdapter) ||
    m.amount !== BigInt(p.amount) ||
    m.minimumFinality !== Number(p.minFinalityThreshold) ||
    m.executedFinality < 2000 ||
    m.maxFee !== BigInt(p.maxFee) ||
    m.feeExecuted > BigInt(p.maxFee) ||
    m.feeExecuted !== 0n ||
    /^0x0+$/.test(m.nonce)
  )
    throw new Error(
      "CCTP message does not match the full approved route; net-fee payment requires a separately approved amount",
    );
  return m;
}
/** Iris attestation retrieval is not settlement. Relayer still must receive this message on destination. */
export async function fetchCctpAttestation(
  input: { testnet: boolean; sourceDomain: number; sourceTransaction: Hex },
  fetcher: Fetcher = fetch,
) {
  if (
    !Number.isInteger(input.sourceDomain) ||
    input.sourceDomain < 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.sourceTransaction)
  )
    throw new Error("Invalid CCTP source identity");
  const host = input.testnet
    ? "https://iris-api-sandbox.circle.com"
    : "https://iris-api.circle.com";
  const response = await fetcher(
    `${host}/v2/messages/${input.sourceDomain}?transactionHash=${input.sourceTransaction}`,
    { signal: AbortSignal.timeout(15_000), redirect: "error" },
  );
  return z
    .object({
      messages: z.array(
        z
          .object({
            message: z.string(),
            attestation: z.string(),
            status: z.string(),
            eventNonce: z.string().optional(),
          })
          .passthrough(),
      ),
    })
    .parse(await boundedJson(response));
}
export async function verifyCctpDestination(input: {
  rpcUrl: string;
  transaction: Hex;
  message: Hex;
  permit: ModulePermit;
  sourceDomain: number;
  sourceMessenger: Address;
  destinationMessenger: Address;
  sourceAdapter: Address;
  destinationTransmitter: Address;
  destinationToken: Address;
  sourceTransaction: Hex;
  testnet: boolean;
}) {
  const attestation = await fetchCctpAttestation({
    testnet: input.testnet,
    sourceDomain: input.sourceDomain,
    sourceTransaction: input.sourceTransaction,
  });
  if (
    !attestation.messages.some(
      (m) =>
        m.status === "complete" &&
        m.message.toLowerCase() === input.message.toLowerCase(),
    )
  )
    throw new Error(
      "Destination message is not bound to the confirmed source transaction by Circle attestation",
    );
  const m = validateCctpMessage(input.message, input),
    client = chainClient(input.rpcUrl);
  if ((await client.getChainId()) !== Number(input.permit.destinationChainId))
    throw new Error("Destination chain mismatch");
  const [receipt, finalized] = await Promise.all([
    client.getTransactionReceipt({ hash: input.transaction }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  if (
    receipt.status !== "success" ||
    finalized.number === null ||
    receipt.blockNumber > finalized.number
  )
    throw new Error("Destination transaction is not finalized");
  if (
    (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
    receipt.blockHash
  )
    throw new Error("Destination receipt was reorganized");
  const matched = receipt.logs
    .filter(
      (l) =>
        l.address.toLowerCase() === input.destinationTransmitter.toLowerCase(),
    )
    .some((log) => {
      try {
        const { args } = decodeEventLog({
          abi: [receivedEvent],
          data: log.data,
          topics: log.topics,
        });
        return (
          args.sourceDomain === m.sourceDomain &&
          args.nonce.toLowerCase() === m.nonce.toLowerCase() &&
          args.sender.toLowerCase() === m.sender.toLowerCase() &&
          args.finalityThresholdExecuted >= 2000 &&
          args.messageBody.toLowerCase() === m.body.toLowerCase()
        );
      } catch {
        return false;
      }
    });
  if (!matched)
    throw new Error(
      "Matching CCTP nonce and message not observed on destination",
    );
  const minted = receipt.logs
    .filter(
      (l) => l.address.toLowerCase() === input.destinationToken.toLowerCase(),
    )
    .some((log) => {
      try {
        const { args } = decodeEventLog({
          abi: [transferEvent],
          data: log.data,
          topics: log.topics,
        });
        return (
          /^0x0+$/.test(args.from) &&
          args.to.toLowerCase() === input.permit.recipient.toLowerCase() &&
          args.value === BigInt(input.permit.amount)
        );
      } catch {
        return false;
      }
    });
  if (!minted)
    throw new Error("Matching native USDC destination mint not observed");
  return {
    finalized: true,
    transaction: input.transaction,
    nonce: m.nonce,
    amount: input.permit.amount,
    recipient: input.permit.recipient,
    chainId: Number(input.permit.destinationChainId),
    blockHash: receipt.blockHash,
  };
}
