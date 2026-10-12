import { formatObligationAmount } from "@/lib/domain/money";

export type WorkspaceRecord = {
  id: string;
  kind: string;
  version: number;
  body: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};
export type WorkspacePayment = {
  id: string;
  invoice_id: string;
  amount: string;
  state: string;
  source_tx?: string | null;
  destination_tx?: string | null;
  created_at?: string;
  invalidated_at?: string | null;
  terminal_failure_proof?: string | null;
};
export type WorkspaceDocument = { id: string; filename: string; mime: string };
export const humanize = (value: unknown) =>
  String(value ?? "—")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll(".", " ");
export function toAtomic(value: string, positive = false) {
  const input = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(input))
    throw new Error("Enter an amount with at most six decimal places.");
  const [whole, fraction = ""] = input.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (positive && amount <= 0n)
    throw new Error("The amount must be greater than zero.");
  if (amount.toString().length > 36)
    throw new Error("This amount is too large.");
  return amount.toString();
}
export function toDecimal(value: unknown) {
  const raw = String(value ?? "0");
  if (!/^\d+$/.test(raw)) return "";
  const amount = BigInt(raw);
  return `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, "0")}`;
}
export function formatAmount(value: unknown, currency: unknown = "USDC") {
  try {
    return formatObligationAmount(
      String(value ?? "0"),
      String(currency ?? "USDC"),
    );
  } catch {
    return "Unavailable";
  }
}
export function formatTime(value: unknown) {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
export function sourceUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
