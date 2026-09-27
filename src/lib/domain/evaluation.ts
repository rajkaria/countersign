import { atomic } from "./money";
export type Cohort =
  | "independent-mainnet"
  | "independent-testnet"
  | "founder-mainnet"
  | "founder-testnet"
  | "historical-replay"
  | "synthetic";
export type EvaluationCase = Readonly<{
  caseId: string;
  businessId: string;
  vendorId: string;
  cohort: Cohort;
  arm: "prior-workflow" | "rules" | "rules-agent";
  label: "valid" | "confirmed-problem" | "disputed";
  action: "PAY" | "SCHEDULE" | "HOLD" | "ASK" | "PROPOSE_PARTIAL";
  humanMinutes: number;
  costUnits: string;
  incorrectIncrementalUnits: string;
  settledUnits: string;
  onTime: boolean;
  repeatCycle: boolean;
  preventedConfirmed?: boolean;
  paymentId?: string;
}>;
function median(items: number[]) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function evaluateCohorts(cases: readonly EvaluationCase[]) {
  const groups = new Map<string, EvaluationCase[]>();
  const ids = new Set<string>();
  for (const c of cases) {
    const key = `${c.cohort}/${c.arm}/${c.caseId}`;
    if (ids.has(key)) throw new Error("Duplicate evaluation case within arm");
    ids.add(key);
    if (!Number.isFinite(c.humanMinutes) || c.humanMinutes < 0)
      throw new Error("Invalid timing measurement");
    atomic(c.costUnits);
    atomic(c.incorrectIncrementalUnits);
    atomic(c.settledUnits);
    const group = `${c.cohort}/${c.arm}`;
    groups.set(group, [...(groups.get(group) ?? []), c]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [cohort, arm] = key.split("/");
    const valid = rows.filter((r) => r.label === "valid"),
      problems = rows.filter((r) => r.label === "confirmed-problem");
    const falseHolds = valid.filter((r) =>
      ["HOLD", "ASK"].includes(r.action),
    ).length;
    const missedProblems = problems.filter((r) => r.action === "PAY").length;
    const payments = new Map<string, string>();
    for (const r of rows) {
      if (atomic(r.settledUnits) > 0n) {
        if (!r.paymentId)
          throw new Error("Settled volume requires a stable payment identity");
        if (
          payments.has(r.paymentId) &&
          payments.get(r.paymentId) !== r.settledUnits
        )
          throw new Error("Conflicting settlement measurements");
        payments.set(r.paymentId, r.settledUnits);
      }
    }
    return {
      cohort,
      arm,
      sampleSize: rows.length,
      businesses: new Set(rows.map((r) => r.businessId)).size,
      recipients: new Set(rows.map((r) => r.vendorId)).size,
      medianHumanMinutes: median(rows.map((r) => r.humanMinutes)),
      falseHolds,
      falseHoldRate: valid.length ? falseHolds / valid.length : null,
      missedProblems,
      missedProblemRate: problems.length
        ? missedProblems / problems.length
        : null,
      disputedLabels: rows.filter((r) => r.label === "disputed").length,
      onTimeCount: rows.filter((r) => r.onTime).length,
      repeatBusinesses: new Set(
        rows.filter((r) => r.repeatCycle).map((r) => r.businessId),
      ).size,
      verifiedAvoidedUnits: rows
        .filter(
          (r) =>
            r.label === "confirmed-problem" &&
            r.preventedConfirmed &&
            r.action !== "PAY",
        )
        .reduce((n, r) => n + atomic(r.incorrectIncrementalUnits), 0n)
        .toString(),
      settledUnits: [...payments.values()]
        .reduce((n, x) => n + atomic(x), 0n)
        .toString(),
      operatingCostUnits: rows
        .reduce((n, r) => n + atomic(r.costUnits), 0n)
        .toString(),
      uncertainty:
        "Descriptive sample only; no statistical guarantee of safety or causal benefit.",
    };
  });
}
