import type { Atomic } from "./types";
export const MAX_ATOMIC = (1n << 256n) - 1n;
export function atomic(value: Atomic): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)$/.test(value) ||
    value.length > 78
  )
    throw new Error("Expected canonical nonnegative integer units");
  const result = BigInt(value);
  if (result > MAX_ATOMIC) throw new Error("Amount exceeds uint256");
  return result;
}
export function units(value: string, decimals = 6): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Invalid decimals");
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error("Amount exceeds asset precision");
  return atomic(BigInt(whole + fraction.padEnd(decimals, "0")).toString());
}
export function formatUnits(value: bigint | string, decimals = 6): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw new Error("Invalid decimals");
  const parsed = atomic(value.toString());
  if (!decimals) return parsed.toString();
  const padded = parsed.toString().padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return padded.slice(0, -decimals) + (fraction ? "." + fraction : "");
}
/** Workspace obligation records use six decimal places in both USD and USDC; this formats, never converts. */
export function formatObligationAmount(value: string, currency: string) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}.${fraction.padEnd(2, "0")} ${currency}`;
}
export function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result) || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    throw new Error("Invalid ISO timestamp");
  return result;
}

/** Quantities use at most six decimal places; charges must resolve to whole atomic units. */
export function quantityUnits(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))
    throw new Error(
      "Expected a nonnegative quantity with at most six decimal places",
    );
  return units(value, 6);
}
export function hourlyCharge(rate: Atomic, quantity: string): bigint {
  const product = atomic(rate) * quantityUnits(quantity);
  if (product % 1_000_000n !== 0n)
    throw new Error(
      "Hourly charge requires fractional atomic units; review the rate or quantity instead of rounding",
    );
  return atomic((product / 1_000_000n).toString());
}
