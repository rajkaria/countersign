import { describe, it, expect } from "vitest";
import { encodePacked, type Hex } from "viem";
import {
  parseCctpV2Message,
  validateCctpMessage,
} from "../../src/lib/integrations/cctp";
import {
  modulePermitSchema,
  permitDigest,
  encodedExecution,
} from "../../src/lib/integrations/module";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222",
  word = (a: string) => `0x${a.slice(2).padStart(64, "0")}` as Hex,
  zero = ("0x" + "00".repeat(32)) as Hex;
const permit = modulePermitSchema.parse({
  schemaVersion: "1",
  chainId: "1",
  safe: a,
  module: a,
  policyEpoch: "1",
  engagementId: word(a),
  engagementVersion: "1",
  obligationId: word(b),
  allocationId: word(a),
  paymentId: word(b),
  sourceChainId: "1",
  destinationChainId: "2",
  recipient: b,
  token: a,
  amount: "100",
  maxFee: "0",
  route: word(a),
  evidenceCommitment: word(b),
  expiresAt: "9999999999",
  nonce: "1",
  coverageId: zero,
  destinationDomain: "6",
  minFinalityThreshold: "2000",
});
function message(fee = 0n, nonce = word(a)): Hex {
  return encodePacked(
    [
      "uint32",
      "uint32",
      "uint32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "uint32",
      "uint32",
      "uint32",
      "bytes32",
      "bytes32",
      "uint256",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      1,
      26,
      6,
      nonce,
      word(a),
      word(b),
      zero,
      2000,
      2000,
      1,
      word(a),
      word(b),
      100n,
      word(a),
      0n,
      fee,
      0n,
    ],
  );
}
const context = {
  permit,
  sourceDomain: 26,
  sourceMessenger: a,
  destinationMessenger: b,
  sourceAdapter: a,
} as const;
describe("CCTP route message binding", () => {
  it("parses fixed v2 message and approves exact full net payment", () => {
    expect(parseCctpV2Message(message()).amount).toBe(100n);
    expect(validateCctpMessage(message(), context).destinationDomain).toBe(6);
  });
  it("rejects fee deduction, unassigned nonce, mismatched recipient, and hooks", () => {
    expect(() => validateCctpMessage(message(1n), context)).toThrow();
    expect(() => validateCctpMessage(message(0n, zero), context)).toThrow();
    expect(() =>
      validateCctpMessage(message(), {
        ...context,
        permit: { ...permit, recipient: a },
      }),
    ).toThrow();
    expect(() => parseCctpV2Message((message() + "ff") as Hex)).toThrow();
  });
  it("every field affecting authority changes the EIP712 digest", () => {
    const original = permitDigest(permit);
    for (const field of [
      "amount",
      "nonce",
      "policyEpoch",
      "maxFee",
      "expiresAt",
      "destinationDomain",
    ] as const) {
      expect(
        permitDigest({
          ...permit,
          [field]: (BigInt(permit[field]) + 1n).toString(),
        }),
      ).not.toBe(original);
    }
    expect(encodedExecution(permit, "0x1234")).toMatch(/^0x/);
  });
});
