import { z } from "zod";
import {
  encodeFunctionData,
  hashTypedData,
  parseAbi,
  type Hex,
  type Abi,
  type TypedData,
} from "viem";
const integer = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(78)
  .refine((v) => BigInt(v) < 1n << 256n);
const u64 = integer.refine((v) => BigInt(v) < 1n << 64n);
const u32 = integer.refine((v) => BigInt(v) < 1n << 32n);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const modulePermitSchema = z
  .object({
    schemaVersion: z.literal("1"),
    chainId: integer,
    safe: address,
    module: address,
    policyEpoch: integer,
    engagementId: bytes32,
    engagementVersion: u64,
    obligationId: bytes32,
    allocationId: bytes32,
    paymentId: bytes32,
    sourceChainId: integer,
    destinationChainId: integer,
    recipient: address,
    token: address,
    amount: integer,
    maxFee: integer,
    route: bytes32,
    evidenceCommitment: bytes32,
    expiresAt: u64,
    nonce: integer,
    coverageId: bytes32,
    destinationDomain: u32,
    minFinalityThreshold: u32,
  })
  .strict();
export type ModulePermit = z.infer<typeof modulePermitSchema>;
export const permitFields = [
  ["schemaVersion", "uint256"],
  ["chainId", "uint256"],
  ["safe", "address"],
  ["module", "address"],
  ["policyEpoch", "uint256"],
  ["engagementId", "bytes32"],
  ["engagementVersion", "uint64"],
  ["obligationId", "bytes32"],
  ["allocationId", "bytes32"],
  ["paymentId", "bytes32"],
  ["sourceChainId", "uint256"],
  ["destinationChainId", "uint256"],
  ["recipient", "address"],
  ["token", "address"],
  ["amount", "uint256"],
  ["maxFee", "uint256"],
  ["route", "bytes32"],
  ["evidenceCommitment", "bytes32"],
  ["expiresAt", "uint64"],
  ["nonce", "uint256"],
  ["coverageId", "bytes32"],
  ["destinationDomain", "uint32"],
  ["minFinalityThreshold", "uint32"],
] as const;
export const permitTypedDataTypes: TypedData = {
  PaymentPermit: permitFields.map(([name, type]) => ({ name, type })),
};
export const EXECUTE_SIGNATURE = `execute((${permitFields.map(([, type]) => type).join(",")}),bytes)`;
const moduleSignatures: readonly string[] = [
  `function execute((${permitFields.map(([name, type]) => `${type} ${name}`).join(",")}) p, bytes verifierSignature)`,
  `function paused() view returns (bool)`,
  `function policyEpoch() view returns (uint256)`,
  `function executor() view returns (address)`,
  `function verifier() view returns (address)`,
  `function safe() view returns (address)`,
  `function token() view returns (address)`,
  `event PaymentExecuted(bytes32 indexed paymentId, bytes32 indexed permitDigest, bytes32 indexed obligationId, address recipient, uint256 amount, bytes32 route, bool destinationConfirmed)`,
];
export const moduleAbi: Abi = parseAbi(moduleSignatures);
export function permitTuple(permit: ModulePermit) {
  const p = modulePermitSchema.parse(permit);
  return permitFields.map(([key]) => p[key]);
}
export function encodedExecution(permit: ModulePermit, signature: Hex): Hex {
  if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length % 2)
    throw new Error("Invalid verifier signature");
  return encodeFunctionData({
    abi: moduleAbi,
    functionName: "execute",
    args: [
      permitTuple(permit).map((value, index) =>
        permitFields[index][1].startsWith("uint") ? BigInt(value) : value,
      ),
      signature,
    ],
  } as never);
}
export function permitDigest(permit: ModulePermit): Hex {
  const p = modulePermitSchema.parse(permit);
  return hashTypedData({
    domain: {
      name: "Countersign",
      version: "1",
      chainId: BigInt(p.chainId),
      verifyingContract: p.module as Hex,
    },
    primaryType: "PaymentPermit",
    types: permitTypedDataTypes,
    message: Object.fromEntries(
      permitFields.map(([name, type]) => [
        name,
        type.startsWith("uint") ? BigInt(p[name]) : p[name],
      ]),
    ) as Record<keyof ModulePermit, bigint | Hex>,
  });
}
