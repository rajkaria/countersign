import { parseAbi, type Address, type Hex } from "viem";
import { chainClient } from "./chain";
import { permitDigest, type ModulePermit } from "./module";
const abi = parseAbi([
  "function reserve() view returns(address)",
  "function allocations(bytes32) view returns(address module,address beneficiary,bytes32 permitDigest,bytes32 paymentId,uint256 cap,uint64 permitExpiry,uint64 claimDeadline,uint8 state,bytes32 termsHash)",
]);
export async function verifyReservedCoverage(rpcUrl: string, p: ModulePermit) {
  if (/^0x0+$/.test(p.coverageId)) return false;
  const client = chainClient(rpcUrl);
  if ((await client.getChainId()) !== Number(p.chainId))
    throw new Error("Coverage chain mismatch");
  const reserve = await client.readContract({
    address: p.module as Address,
    abi,
    functionName: "reserve",
  });
  if (/^0x0+$/.test(reserve)) return false;
  const a = await client.readContract({
    address: reserve,
    abi,
    functionName: "allocations",
    args: [p.coverageId as Hex],
  });
  return (
    a[7] === 1 &&
    a[0].toLowerCase() === p.module.toLowerCase() &&
    a[1].toLowerCase() === p.safe.toLowerCase() &&
    a[2] === permitDigest(p) &&
    a[3] === p.paymentId &&
    a[4] >= BigInt(p.amount) &&
    a[5] === BigInt(p.expiresAt)
  );
}
