import { atomic, timestamp } from "./money";
import type { Atomic } from "./types";
export type PlanItem = Readonly<{
  id: string;
  amount: Atomic;
  fee: Atomic;
  dueAt: string;
  priority: number;
  eligible: boolean;
  allowEarly?: boolean;
  routeLeadSeconds?: number;
}>;
export type CommitmentInput = Readonly<{
  confirmedCash: Atomic;
  operatingReserve: Atomic;
  protectedReserve: Atomic;
  pendingReserve: Atomic;
  expectedInflows: Atomic;
  now: string;
  items: readonly PlanItem[];
}>;
/** Protected/pending reserves are disjoint existing commitments, not duplicated in items. Expected inflows are explanatory only. */
export function planCommitments(input: CommitmentInput) {
  const now = timestamp(input.now);
  let cash = atomic(input.confirmedCash);
  const floor =
    atomic(input.operatingReserve) +
    atomic(input.protectedReserve) +
    atomic(input.pendingReserve);
  atomic(input.expectedInflows);
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.id)) throw new Error("Duplicate plan obligation");
    seen.add(item.id);
    timestamp(item.dueAt);
    atomic(item.amount);
    atomic(item.fee);
    if (
      !Number.isFinite(item.priority) ||
      !Number.isFinite(item.routeLeadSeconds ?? 0) ||
      (item.routeLeadSeconds ?? 0) < 0
    )
      throw new Error("Invalid scheduling inputs");
  }
  const items = [...input.items]
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        timestamp(a.dueAt) - timestamp(b.dueAt) ||
        a.id.localeCompare(b.id),
    )
    .map((item) => {
      const cost = atomic(item.amount) + atomic(item.fee);
      const available = cash > floor ? cash - floor : 0n;
      const shortfall = cost > available ? cost - available : 0n;
      const executionAt =
        timestamp(item.dueAt) - (item.routeLeadSeconds ?? 0) * 1000;
      const action = !item.eligible
        ? "HOLD"
        : shortfall > 0n
          ? "SCHEDULE"
          : !item.allowEarly && executionAt > now
            ? "SCHEDULE"
            : "PAY";
      if (item.eligible && shortfall === 0n) cash -= cost;
      return {
        ...item,
        action,
        shortfall: shortfall.toString(),
        reserved: item.eligible && shortfall === 0n,
        executionAt: new Date(Math.max(now, executionAt)).toISOString(),
        reason: !item.eligible
          ? "Resolve release conditions."
          : shortfall > 0n
            ? "Confirmed cash cannot cover this payment and protected commitments."
            : action === "SCHEDULE"
              ? "Capacity reserved for the permitted payment window."
              : "Eligible within confirmed cash and protected commitments.",
      };
    });
  return {
    items,
    remainingCash: cash.toString(),
    protectedTotal: floor.toString(),
    expectedInflows: input.expectedInflows,
    expectedInflowsSpendable: false as const,
    generatedAt: input.now,
    shortfall: (cash < floor ? floor - cash : 0n).toString(),
  };
}
