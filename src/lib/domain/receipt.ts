import {
  sha256,
  keccak256,
  stringToHex,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import type { Decision } from "./types";
import { atomic, timestamp } from "./money";
import { modulePermitSchema, permitDigest } from "./permit";
const amount = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(78);
const date = z.string().datetime({ offset: true });
const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const action = z.enum(["PAY", "SCHEDULE", "HOLD", "ASK", "PROPOSE_PARTIAL"]);
export const decisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: z.string().min(1),
    invoiceId: z.string().min(1),
    invoiceVersion: z.number().int().positive(),
    engagementId: z.string().min(1),
    engagementVersion: z.number().int().positive(),
    policyVersion: z.number().int().positive(),
    action,
    executable: z.boolean(),
    amount,
    reason: z.string(),
    findings: z.array(
      z
        .object({
          code: z.string(),
          severity: z.enum(["hold", "ask", "info"]),
          message: z.string(),
          sourceIds: z.array(z.string()),
        })
        .strict(),
    ),
    evaluatedAt: date,
    validUntil: date,
    nextCheck: z.string(),
    sourceIds: z.array(z.string()),
    availableActions: z.array(action),
  })
  .strict();
export const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    decision: decisionSchema,
    permit: z
      .object({
        paymentId: z.string().min(1),
        recipient: address,
        amount,
        sourceChainId: z.number().int().positive(),
        destinationChainId: z.number().int().positive(),
        asset: z.string().min(1),
        policyVersion: z.number().int().positive(),
        engagementVersion: z.number().int().positive(),
        expiresAt: date,
      })
      .strict(),
    execution: z
      .object({ permit: modulePermitSchema, digest: hash })
      .strict()
      .optional(),
    settlement: z
      .object({
        paymentId: z.string().min(1),
        transaction: z.string().min(1),
        chainId: z.number().int().positive(),
        recipient: address,
        asset: z.string().min(1),
        amount,
        confirmedAt: date,
      })
      .strict()
      .nullable(),
    evidenceCommitments: z.array(z.string().regex(/^(0x)?[0-9a-f]{64}$/)),
    createdAt: date,
    hash,
  })
  .strict();
export type Receipt = z.infer<typeof receiptSchema>;
export type ReceiptBody = Omit<
  Receipt,
  "schemaVersion" | "hash" | "decision"
> & { decision: Decision };
/** RFC-8785-inspired restricted JSON canonicalization: finite safe integers only, lexicographic object keys; amounts stay decimal strings. */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("Canonical receipt numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return "[" + value.map(canonicalize).join(",") + "]";
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      "{" +
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalize(v))
        .join(",") +
      "}"
    );
  throw new Error("Unsupported canonical JSON value");
}
export function commitment(value: unknown): Hex {
  return sha256(stringToHex(canonicalize(value)));
}
export function createReceipt(body: ReceiptBody): Receipt {
  const unsigned = { ...body, schemaVersion: 1 as const };
  const receipt = receiptSchema.parse({
    ...unsigned,
    hash: commitment(unsigned),
  });
  const verification = verifyReceipt(receipt);
  if (!verification.integrityValid)
    throw new Error(verification.errors.join("; "));
  return receipt;
}
export function verifyReceipt(value: unknown, trustedCommitment?: string) {
  const errors: string[] = [];
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success)
    return {
      integrityValid: false,
      anchored: false,
      errors: ["Receipt does not match schema v1."],
      limitations: receiptLimitations,
    };
  const r = parsed.data;
  const { hash: recorded, ...body } = r;
  if (commitment(body) !== recorded) errors.push("Receipt hash mismatch.");
  try {
    atomic(r.permit.amount);
    if (
      r.permit.amount !== r.decision.amount ||
      r.permit.policyVersion !== r.decision.policyVersion ||
      r.permit.engagementVersion !== r.decision.engagementVersion
    )
      errors.push("Permit does not bind the decision amount and versions.");
    if (
      timestamp(r.permit.expiresAt) > timestamp(r.decision.validUntil) ||
      timestamp(r.permit.expiresAt) <= timestamp(r.decision.evaluatedAt)
    )
      errors.push("Permit expiry exceeds decision validity.");
    if (r.execution) {
      const p = r.execution.permit;
      if (permitDigest(p) !== r.execution.digest)
        errors.push("On-chain permit digest mismatch.");
      if (
        p.paymentId !== keccak256(stringToHex(r.permit.paymentId)) ||
        p.engagementId !== keccak256(stringToHex(r.decision.engagementId)) ||
        p.engagementVersion !== String(r.decision.engagementVersion) ||
        p.amount !== r.permit.amount ||
        p.recipient.toLowerCase() !== r.permit.recipient.toLowerCase() ||
        p.token.toLowerCase() !== r.permit.asset.toLowerCase() ||
        p.sourceChainId !== String(r.permit.sourceChainId) ||
        p.destinationChainId !== String(r.permit.destinationChainId) ||
        Number(p.expiresAt) * 1000 !== timestamp(r.permit.expiresAt)
      )
        errors.push("On-chain execution permit does not bind this receipt.");
    }
    if (r.settlement) {
      if (!r.execution)
        errors.push(
          "Settled receipts require the complete execution permit and digest.",
        );
      const s = r.settlement,
        p = r.permit;
      if (!r.decision.executable || r.decision.action !== "PAY")
        errors.push("Settlement is bound to a nonexecutable decision.");
      if (
        s.paymentId !== p.paymentId ||
        s.chainId !== p.destinationChainId ||
        s.recipient.toLowerCase() !== p.recipient.toLowerCase() ||
        s.asset !== p.asset ||
        s.amount !== p.amount
      )
        errors.push("Destination settlement does not match the permit.");
      if (timestamp(s.confirmedAt) < timestamp(r.decision.evaluatedAt))
        errors.push("Settlement predates its decision.");
    }
    if (timestamp(r.createdAt) < timestamp(r.decision.evaluatedAt))
      errors.push("Receipt predates its decision.");
  } catch {
    errors.push("Invalid amount or timestamp.");
  }
  if (trustedCommitment !== undefined && recorded !== trustedCommitment)
    errors.push("Trusted external commitment mismatch.");
  return {
    integrityValid: errors.length === 0,
    anchored: errors.length === 0 && trustedCommitment === recorded,
    errors,
    limitations: receiptLimitations,
  };
}
export const receiptLimitations = [
  "Hash integrity does not prove work quality, source truth, complete logging, or chain finality.",
  "Without an independently trusted commitment or signer, an attacker can replace a receipt and recompute its hash.",
  "Settlement references require independent chain verification; this offline verifier makes no network requests.",
  "Redact source content before creation. Publish randomized commitments rather than unsalted hashes of private low-entropy documents.",
] as const;
/** Signature proves control of the trusted signer address, not truth of the source documents. */
export async function verifyReceiptSignature(
  receipt: Receipt,
  signature: Hex,
  trustedSigner: Address,
) {
  if (!verifyReceipt(receipt).integrityValid) return false;
  try {
    return await verifyMessage({
      address: trustedSigner,
      message: `Countersign receipt v1:${receipt.hash}`,
      signature,
    });
  } catch {
    return false;
  }
}
