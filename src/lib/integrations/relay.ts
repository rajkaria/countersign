import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { type Database, ServiceError } from "../server/db";
import { type Actor, requireRole } from "../server/auth";
import { audit } from "../server/records";
import type { PaymentRow } from "../server/worker";
import { modulePermitSchema, permitDigest, type ModulePermit } from "./module";
import { CCTP_ROUTE, verifySourceSettlement } from "./chain";
import {
  fetchCctpAttestation,
  validateCctpMessage,
  verifyCctpDestination,
} from "./cctp";
import type { CircleRunner } from "./circle";
import type { Fetcher } from "./http";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  date = z.string().datetime({ offset: true });
const rpc = z
  .string()
  .url()
  .refine((v) => ["https:", "http:"].includes(new URL(v).protocol));
export const destinationRelayConfigSchema = z
  .object({
    organizationId: z.string().uuid(),
    sourceChainId: z.number().int().positive().safe(),
    destinationChainId: z.number().int().positive().safe(),
    sourceDomain: z.number().int().nonnegative().max(4294967295),
    destinationDomain: z.number().int().nonnegative().max(4294967295),
    sourceModule: address,
    sourceSafe: address,
    sourceToken: address,
    sourceMessenger: address,
    destinationMessenger: address,
    sourceAdapter: address,
    destinationTransmitter: address,
    destinationToken: address,
    sourceRpcUrl: rpc,
    destinationRpcUrl: rpc,
    destinationTransmitterCodeHash: hash,
    destinationMessengerCodeHash: hash,
    circle: z
      .object({
        binary: z.string().min(1),
        wallet: address,
        chain: z.string().min(1),
        cliHome: z.string().min(1),
      })
      .strict(),
    review: z
      .object({
        reviewer: z.string().min(1),
        reportHash: hash,
        compatibilityTransaction: hash,
        verifiedAt: date,
        expiresAt: date,
      })
      .strict(),
    testnet: z.boolean(),
    enabled: z.boolean().default(false),
  })
  .strict();
export type DestinationRelayConfig = z.infer<
  typeof destinationRelayConfigSchema
>;
export type RelayDependencies = {
  runner?: CircleRunner;
  fetcher?: Fetcher;
  verifySource?: typeof verifySourceSettlement;
  verifyDestination?: typeof verifyCctpDestination;
};
type RelayRow = {
  id: string;
  organization_id: string;
  payment_id: string;
  source_tx: string;
  permit_digest: string;
  configuration_digest: string;
  state: string;
  attempts: number;
  message: string | null;
  message_hash: string | null;
  attestation: string | null;
  provider_id: string | null;
  transaction_hash: string | null;
};
export type DestinationRelayResult = {
  finalized: boolean;
  transaction: string;
};
const txSchema = z
  .object({
    id: z.string().min(1),
    state: z.string().min(1),
    txHash: hash.optional(),
    transactionHash: hash.optional(),
  })
  .passthrough();
const execFileAsync = promisify(execFile);
/** UUIDv5 with a dedicated namespace/name: a relay can never reuse the source payment's provider operation identity. */
export function relayOperationId(
  organizationId: string,
  paymentId: string,
  destinationChainId: number,
) {
  const bytes = createHash("sha1")
    .update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update(
      `countersign:destination-relay:v1:${organizationId}:${paymentId}:${destinationChainId}`,
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function relayConfigFromEnv(): Promise<DestinationRelayConfig | null> {
  const inline = process.env.RELAY_CONFIG_JSON,
    path = process.env.RELAY_CONFIG_PATH;
  if (!inline && !path) return null;
  const raw = inline ?? (await readFile(path!, "utf8"));
  if (raw.length > 64000)
    throw new Error("Relay configuration exceeds size limit");
  return destinationRelayConfigSchema.parse(JSON.parse(raw));
}
// RPC endpoints and credentials may rotate; the money-affecting route, wallet and pinned code identities may not silently change.
function configurationDigest(c: DestinationRelayConfig) {
  return keccak256(
    stringToHex(
      JSON.stringify([
        c.organizationId,
        c.sourceChainId,
        c.destinationChainId,
        c.sourceDomain,
        c.destinationDomain,
        c.sourceModule.toLowerCase(),
        c.sourceSafe.toLowerCase(),
        c.sourceToken.toLowerCase(),
        c.sourceMessenger.toLowerCase(),
        c.destinationMessenger.toLowerCase(),
        c.sourceAdapter.toLowerCase(),
        c.destinationTransmitter.toLowerCase(),
        c.destinationToken.toLowerCase(),
        c.destinationTransmitterCodeHash.toLowerCase(),
        c.destinationMessengerCodeHash.toLowerCase(),
        c.circle.wallet.toLowerCase(),
        c.circle.chain,
        c.testnet,
      ]),
    ),
  );
}
function defaultRunner(config: DestinationRelayConfig): CircleRunner {
  return async (args) => {
    const result = await execFileAsync(config.circle.binary, args, {
      timeout: 45000,
      maxBuffer: 1024 * 1024,
      env: {
        NODE_ENV: process.env.NODE_ENV ?? "production",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        TMPDIR: process.env.TMPDIR,
        CIRCLE_CLI_HOME: config.circle.cliHome,
        CIRCLE_VERSION_CHECK: "off",
        NO_COLOR: "1",
      },
    });
    return JSON.parse(result.stdout).data;
  };
}
function validateRelayMessage(
  message: Hex,
  permit: ModulePermit,
  config: DestinationRelayConfig,
) {
  const parsed = validateCctpMessage(message, {
    permit,
    sourceDomain: config.sourceDomain,
    sourceMessenger: config.sourceMessenger as Address,
    destinationMessenger: config.destinationMessenger as Address,
    sourceAdapter: config.sourceAdapter as Address,
  });
  const caller = message.slice(2 + 108 * 2, 2 + 140 * 2),
    expiration = message.slice(2 + (148 + 196) * 2);
  if (
    !/^0+$/.test(caller) ||
    !/^0+$/.test(expiration) ||
    parsed.maxFee !== 0n ||
    parsed.feeExecuted !== 0n
  )
    throw new Error(
      "Only permissionless, unexpired standard zero-fee CCTP messages are supported",
    );
  return parsed;
}
async function lookup(
  runner: CircleRunner,
  c: DestinationRelayConfig,
  providerId: string,
) {
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const args = [
      "transaction",
      "list",
      "--address",
      c.circle.wallet,
      "--chain",
      c.circle.chain,
      "--operation",
      "execute",
      "--limit",
      "50",
      "--output",
      "json",
    ];
    if (cursor) args.push("--cursor", cursor);
    const result = z
      .object({ transactions: z.array(txSchema) })
      .parse(await runner(args));
    const found = result.transactions.find((t) => t.id === providerId);
    if (found) return found;
    if (result.transactions.length < 50) return null;
    cursor = result.transactions.at(-1)?.id;
  }
  throw new Error(
    "Destination provider history exceeds bounded reconciliation scan; attach the existing transaction",
  );
}
/**
 * Reconcile existing CCTP source/destination operations using an AUTOCOMMIT connection.
 * Fresh receiveMessage broadcasts are disabled on every network in this release.
 * Dependencies are server-side test seams; never accept them or config from a model/public request.
 */
export async function runDestinationRelay(
  db: Database,
  payment: PaymentRow,
  inputPermit: ModulePermit,
  inputConfig: DestinationRelayConfig,
  deps: RelayDependencies = {},
): Promise<DestinationRelayResult> {
  const config = destinationRelayConfigSchema.parse(inputConfig),
    permit = modulePermitSchema.parse(inputPermit),
    digest = permitDigest(permit);
  if (
    payment.organization_id !== config.organizationId ||
    permit.paymentId !== keccak256(stringToHex(payment.id)) ||
    permit.amount !== payment.amount ||
    permit.sourceChainId !== String(config.sourceChainId) ||
    permit.destinationChainId !== String(config.destinationChainId) ||
    config.sourceChainId === config.destinationChainId ||
    Number(permit.destinationDomain) !== config.destinationDomain ||
    permit.route !== CCTP_ROUTE ||
    permit.maxFee !== "0" ||
    permit.minFinalityThreshold !== "2000" ||
    permit.module.toLowerCase() !== config.sourceModule.toLowerCase() ||
    permit.safe.toLowerCase() !== config.sourceSafe.toLowerCase() ||
    permit.token.toLowerCase() !== config.sourceToken.toLowerCase()
  )
    throw new Error(
      "Payment does not match the fixed zero-fee destination relay route",
    );
  const stored = (
    await db.query<PaymentRow>(
      "SELECT * FROM payment_intents WHERE id=$1 AND organization_id=$2",
      [payment.id, payment.organization_id],
    )
  ).rows[0];
  if (
    !stored?.source_tx ||
    stored.source_tx.toLowerCase() !== payment.source_tx?.toLowerCase() ||
    stored.amount !== permit.amount ||
    permitDigest(modulePermitSchema.parse(stored.permit.modulePermit)) !==
      digest
  )
    throw new Error("Durable source payment binding is missing or changed");
  const sourceTransaction = hash.parse(stored.source_tx) as Hex,
    relayId = relayOperationId(
      payment.organization_id,
      payment.id,
      config.destinationChainId,
    ),
    configDigest = configurationDigest(config);
  if (relayId === payment.id)
    throw new Error("Source and destination operation identities must differ");
  await db.query(
    "INSERT INTO destination_relays(id,organization_id,payment_id,source_tx,permit_digest,configuration_digest,destination_chain_id,destination_transmitter,destination_wallet) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(payment_id) DO NOTHING",
    [
      relayId,
      payment.organization_id,
      payment.id,
      sourceTransaction,
      digest,
      configDigest,
      config.destinationChainId,
      config.destinationTransmitter.toLowerCase(),
      config.circle.wallet.toLowerCase(),
    ],
  );
  const read = async () => {
    const r = (
      await db.query<RelayRow>(
        "SELECT * FROM destination_relays WHERE organization_id=$1 AND payment_id=$2",
        [payment.organization_id, payment.id],
      )
    ).rows[0];
    if (
      !r ||
      r.id !== relayId ||
      r.source_tx.toLowerCase() !== sourceTransaction.toLowerCase() ||
      r.permit_digest !== digest ||
      r.configuration_digest !== configDigest
    )
      throw new Error(
        "Existing relay binding differs; do not create a replacement operation",
      );
    return r;
  };
  let row = await read();
  if (row.state === "settled" && row.transaction_hash)
    return { finalized: true, transaction: row.transaction_hash };
  const source = await (deps.verifySource ?? verifySourceSettlement)({
    rpcUrl: config.sourceRpcUrl,
    transaction: sourceTransaction,
    permit,
  });
  if (!source.finalized || !source.crossChain)
    throw new Error(
      "Independent cross-chain source finality is required before relay",
    );
  if (!row.message) {
    const iris = await fetchCctpAttestation(
      {
        testnet: config.testnet,
        sourceDomain: config.sourceDomain,
        sourceTransaction,
      },
      deps.fetcher,
    );
    if (iris.messages.length > 100)
      throw new Error("Attestation result exceeds bounded message count");
    const complete = iris.messages.filter((m) => m.status === "complete");
    if (!complete.length) return { finalized: false, transaction: "" };
    const candidates = complete.filter((m) => {
      try {
        validateRelayMessage(m.message as Hex, permit, config);
        return true;
      } catch {
        return false;
      }
    });
    if (candidates.length !== 1)
      throw new Error(
        "Exactly one matching attested source message is required",
      );
    const message = candidates[0].message as Hex,
      attestation = candidates[0].attestation;
    if (!/^0x(?:[0-9a-fA-F]{130}){1,32}$/.test(attestation))
      throw new Error("Malformed or oversized Circle attestation");
    await db.query(
      "UPDATE destination_relays SET message=$3,message_hash=$4,attestation=$5,state='prepared',updated_at=now() WHERE id=$1 AND organization_id=$2 AND state='attestation_pending' AND message IS NULL",
      [
        relayId,
        payment.organization_id,
        message,
        keccak256(message),
        attestation,
      ],
    );
    row = await read();
  }
  if (!row.message || !row.attestation)
    throw new Error("Durable relay message is incomplete");
  const message = row.message as Hex;
  validateRelayMessage(message, permit, config);
  if (keccak256(message) !== row.message_hash)
    throw new Error("Stored relay message commitment mismatch");
  const runner = deps.runner ?? defaultRunner(config);
  let destination = row.transaction_hash ?? stored.destination_tx;
  if (!destination && row.provider_id) {
    const tx = await lookup(runner, config, row.provider_id);
    destination = tx?.txHash ?? tx?.transactionHash ?? null;
    if (
      tx &&
      ["FAILED", "CANCELLED", "DENIED"].includes(tx.state.toUpperCase())
    ) {
      await db.query(
        "UPDATE destination_relays SET state='recovery_required',last_error='Provider failure is not independent proof of nonexecution',updated_at=now() WHERE id=$1 AND organization_id=$2 AND state<>'settled'",
        [relayId, payment.organization_id],
      );
      if (!destination) return { finalized: false, transaction: "" };
    }
  }
  if (destination) {
    const tx = hash.parse(destination) as Hex;
    const verified = await (deps.verifyDestination ?? verifyCctpDestination)({
      rpcUrl: config.destinationRpcUrl,
      transaction: tx,
      message,
      permit,
      sourceDomain: config.sourceDomain,
      sourceMessenger: config.sourceMessenger as Address,
      destinationMessenger: config.destinationMessenger as Address,
      sourceAdapter: config.sourceAdapter as Address,
      destinationTransmitter: config.destinationTransmitter as Address,
      destinationToken: config.destinationToken as Address,
      sourceTransaction,
      testnet: config.testnet,
    });
    if (
      !verified.finalized ||
      verified.transaction.toLowerCase() !== tx.toLowerCase()
    )
      throw new Error(
        "Destination verification did not establish this exact transaction",
      );
    await db.query(
      "UPDATE destination_relays SET state='settled',transaction_hash=$3,confirmed_at=now(),last_error=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",
      [relayId, payment.organization_id, tx],
    );
    await db.query(
      "UPDATE payment_intents SET destination_tx=$3,permit=permit||jsonb_build_object('cctpMessage',$4::text,'relayOperationId',$5::text),updated_at=now() WHERE id=$1 AND organization_id=$2",
      [payment.id, payment.organization_id, tx, message, relayId],
    );
    return { finalized: true, transaction: tx };
  }
  if (
    ["submitting", "submitted", "uncertain", "recovery_required"].includes(
      row.state,
    )
  )
    return { finalized: false, transaction: "" };
  // This release creates payment authority only for direct Arc testnet transfers.
  // Existing provider lookup, attached receipts, and unknown-operation identities above
  // remain reconcilable even when their original review has expired.
  throw new Error(
    "Destination relay submission is disabled on every network; only direct Arc testnet payments can create new financial authority. Reconcile the existing destination operation.",
  );
}
/** Attach evidence only. Never submits a transaction or marks an invoice settled. Use the authenticated API transaction. */
export async function attachDestinationRelayTransaction(
  db: Database,
  actor: Actor,
  paymentId: string,
  transaction: string,
  note: string,
) {
  requireRole(actor, ["owner", "approver", "operator"]);
  z.string().uuid().parse(paymentId);
  hash.parse(transaction);
  z.string().trim().min(12).max(2000).parse(note);
  const member = (
    await db.query<{ role: string }>(
      "SELECT role FROM members WHERE organization_id=$1 AND wallet=$2",
      [actor.organizationId, actor.wallet],
    )
  ).rows[0];
  if (member?.role !== actor.role)
    throw new ServiceError(
      403,
      "ROLE",
      "Your current workspace role cannot attach relay evidence.",
    );
  const row = (
    await db.query<RelayRow>(
      "SELECT * FROM destination_relays WHERE organization_id=$1 AND payment_id=$2 FOR UPDATE",
      [actor.organizationId, paymentId],
    )
  ).rows[0];
  if (!row)
    throw new ServiceError(
      404,
      "RELAY_NOT_FOUND",
      "No relay exists for this payment in the workspace.",
    );
  if (row.state === "settled")
    throw new ServiceError(
      409,
      "RELAY_SETTLED",
      "This destination relay is already independently confirmed.",
    );
  await db.query(
    "UPDATE destination_relays SET transaction_hash=$3,attached_by=$4,attached_reason=$5,updated_at=now() WHERE id=$1 AND organization_id=$2",
    [row.id, actor.organizationId, transaction, actor.wallet, note],
  );
  await audit(db, actor, "relay.transaction_attached", paymentId, {
    relayId: row.id,
    transaction,
    previousTransaction: row.transaction_hash,
    note,
    verification: "pending_independent_destination_event_check",
  });
  return { relayId: row.id, transaction, verified: false };
}
