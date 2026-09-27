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

import { z } from "zod";
import { commitment } from "./receipt";
const cohortSchema = z.enum([
  "independent-mainnet",
  "independent-testnet",
  "founder-mainnet",
  "founder-testnet",
  "historical-replay",
  "synthetic",
]);
const hashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
const atomicSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(78);
export const evaluationBundleSchema = z
  .object({
    manifest: z
      .object({
        schemaVersion: z.literal(1),
        id: z.string().min(1),
        frozenAt: z.string().datetime({ offset: true }),
        adjudicator: z.string().min(1),
        split: z.literal("held-out"),
        cases: z
          .array(
            z
              .object({
                caseId: z.string().min(1),
                businessId: z.string().min(1),
                vendorId: z.string().min(1),
                cohort: cohortSchema,
                label: z.enum(["valid", "confirmed-problem", "disputed"]),
                inputCommitment: hashSchema,
                asOf: z.string().datetime({ offset: true }),
                incorrectIncrementalUnits: atomicSchema,
              })
              .strict(),
          )
          .max(100_000),
      })
      .strict(),
    manifestCommitment: hashSchema,
    results: z
      .array(
        z
          .object({
            caseId: z.string().min(1),
            inputCommitment: hashSchema,
            arm: z.enum(["prior-workflow", "rules", "rules-agent"]),
            action: z.enum([
              "PAY",
              "SCHEDULE",
              "HOLD",
              "ASK",
              "PROPOSE_PARTIAL",
            ]),
            humanMinutes: z.number().finite().nonnegative(),
            costUnits: atomicSchema,
            settledUnits: atomicSchema,
            onTime: z.boolean(),
            repeatCycle: z.boolean(),
            preventedConfirmed: z.boolean().optional(),
            paymentId: z.string().optional(),
            timingEvidenceId: z.string().min(1),
            observedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .max(300_000),
  })
  .strict();
/** Frozen manifest describes the identical information available to each experimental arm. No fabricated measurement defaults. */
export function evaluateExperiment(
  value: unknown,
  trustedManifestCommitment?: string,
) {
  const data = evaluationBundleSchema.parse(value);
  if (
    commitment(data.manifest) !== data.manifestCommitment ||
    (trustedManifestCommitment !== undefined &&
      trustedManifestCommitment !== data.manifestCommitment)
  )
    throw new Error("Frozen manifest commitment mismatch");
  const cases = new Map(data.manifest.cases.map((c) => [c.caseId, c]));
  if (cases.size !== data.manifest.cases.length)
    throw new Error("Duplicate frozen case identity");
  const seen = new Map<string, Set<string>>();
  const measurements: EvaluationCase[] = [];
  for (const result of data.results) {
    const c = cases.get(result.caseId);
    if (
      !c ||
      result.inputCommitment !== c.inputCommitment ||
      Date.parse(c.asOf) > Date.parse(data.manifest.frozenAt) ||
      Date.parse(result.observedAt) < Date.parse(data.manifest.frozenAt)
    )
      throw new Error(
        "Evaluation must use the identical frozen point-in-time input",
      );
    const arms = seen.get(c.caseId) ?? new Set<string>();
    if (arms.has(result.arm)) throw new Error("Duplicate arm measurement");
    arms.add(result.arm);
    seen.set(c.caseId, arms);
    measurements.push({ ...c, ...result });
  }
  if ([...cases.keys()].some((id) => seen.get(id)?.size !== 3))
    throw new Error("Every frozen case must include all three evaluation arms");
  return {
    schemaVersion: 1,
    datasetId: data.manifest.id,
    manifestCommitment: data.manifestCommitment,
    externallyAnchored: trustedManifestCommitment === data.manifestCommitment,
    heldOutCaseCount: cases.size,
    measurements: data.results.length,
    metrics: evaluateCohorts(measurements),
    limitations: [
      "Commitments detect changes relative to a trusted frozen manifest; they do not prove data truth or prevent training-set leakage.",
      "Human timing is supplied with evidence IDs; this tool does not fabricate timings or verify the human measurement externally.",
      "Synthetic, replay, founder, independent, mainnet, and testnet cohorts remain separate.",
      "Small samples are descriptive; no causal or safety guarantee is established.",
    ],
  };
}
