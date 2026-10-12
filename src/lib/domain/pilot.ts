import { z } from "zod";
import { evaluateExperiment, evaluationBundleSchema } from "./evaluation";
import { atomic } from "./money";
import { commitment } from "./receipt";

const id = z.string().trim().min(1).max(200);
const date = z.string().datetime({ offset: true });
const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const amount = z.string().refine((value) => {
  try {
    atomic(value);
    return true;
  } catch {
    return false;
  }
}, "Expected canonical uint256 atomic units");
const existingCase = evaluationBundleSchema.shape.manifest.shape.cases.element;
const existingResult = evaluationBundleSchema.shape.results.element;
const asset = z.object({
  id,
  label: id,
  decimals: z.number().int().min(0).max(36),
}).strict();
const consentGrant = z.object({
  evidenceId: id,
  grantedAt: date,
  revokedAt: date.nullable(),
}).strict();
const consent = z.object({
  businessId: id,
  localAnalysis: consentGrant.nullable(),
  publication: consentGrant.nullable(),
}).strict();
const snapshot = z.object({
  asOf: date,
  evidenceIds: z.array(id).min(1).max(1_000),
  content: z.json(),
}).strict();
const caseFields = {
  caseId: id,
  businessId: id,
  vendorId: id,
  cohort: existingCase.shape.cohort,
  label: existingCase.shape.label,
  incorrectIncrementalUnits: amount,
  obligationUnits: amount,
  dueAt: date,
  adjudicationEvidenceId: id,
  snapshot,
};
const pilotCase = z.object(caseFields).strict();
export const pilotCaseDraftSchema = z.object({
  caseId: id.nullable(),
  businessId: id.nullable(),
  vendorId: id.nullable(),
  cohort: existingCase.shape.cohort.nullable(),
  label: existingCase.shape.label.nullable(),
  incorrectIncrementalUnits: amount.nullable(),
  obligationUnits: amount.nullable(),
  dueAt: date.nullable(),
  adjudicationEvidenceId: id.nullable(),
  snapshot: snapshot.nullable(),
}).strict();
export const pilotDraftSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: id.nullable(),
  adjudicatorId: id.nullable(),
  settlementAsset: asset.nullable(),
  operatingCostAsset: asset.nullable(),
  consents: z.array(consent).max(100_000),
  cases: z.array(pilotCaseDraftSchema).max(100_000),
}).strict();
const preparedStudy = pilotDraftSchema.extend({
  studyId: id,
  adjudicatorId: id,
  settlementAsset: asset,
  operatingCostAsset: asset,
  cases: z.array(pilotCase).min(1).max(100_000),
});
const settlement = z.object({
  paymentId: id,
  units: amount,
  deliveredAt: date,
  evidenceId: id,
}).strict();
const measurementFields = {
  caseId: id,
  inputCommitment: hash,
  arm: existingResult.shape.arm,
  operatorId: id,
  action: existingResult.shape.action,
  reviewStartedAt: date,
  reviewEndedAt: date,
  pausedMilliseconds: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  timingEvidenceId: id,
  decisionEvidenceId: id,
  costUnits: amount,
  costEvidenceId: id,
  appliedToWorkflow: z.boolean(),
  dueOutcome: z.enum(["on-time", "late", "unpaid", "not-due", "unknown", "not-observed"]),
  settlement: settlement.nullable(),
  repeatCycleEvidenceId: id.nullable(),
  preventedEvidenceId: id.nullable(),
  observedAt: date,
};
const measurement = z.object(measurementFields).strict();
export const pilotMeasurementDraftSchema = z.object({
  caseId: id.nullable(),
  inputCommitment: hash.nullable(),
  arm: existingResult.shape.arm.nullable(),
  operatorId: id.nullable(),
  action: existingResult.shape.action.nullable(),
  reviewStartedAt: date.nullable(),
  reviewEndedAt: date.nullable(),
  pausedMilliseconds: measurementFields.pausedMilliseconds.nullable(),
  timingEvidenceId: id.nullable(),
  decisionEvidenceId: id.nullable(),
  costUnits: amount.nullable(),
  costEvidenceId: id.nullable(),
  appliedToWorkflow: z.boolean().nullable(),
  dueOutcome: measurementFields.dueOutcome.nullable(),
  settlement: settlement.nullable(),
  repeatCycleEvidenceId: id.nullable(),
  preventedEvidenceId: id.nullable(),
  observedAt: date.nullable(),
}).strict();
const frozenCase = pilotCase.extend({
  snapshot: snapshot.extend({ salt: z.string().regex(/^[0-9a-f]{64}$/) }),
  inputCommitment: hash,
  consentEvidenceId: id.nullable(),
});
const frozenData = z.object({
  schemaVersion: z.literal(1),
  studyId: id,
  adjudicatorId: id,
  settlementAsset: asset,
  operatingCostAsset: asset,
  frozenAt: date,
  cases: z.array(frozenCase).min(1).max(100_000),
}).strict();
const sessionSchema = z.object({
  schemaVersion: z.literal(1),
  frozen: z.object({ data: frozenData, commitment: hash }).strict(),
  consents: z.array(consent).max(100_000),
  measurements: z.array(measurement).max(300_000),
}).strict();
export type PilotSession = z.infer<typeof sessionSchema>;
type PilotMeasurement = z.infer<typeof measurement>;
type FrozenCase = z.infer<typeof frozenCase>;
type Consent = z.infer<typeof consent>;
const arms = ["prior-workflow", "rules", "rules-agent"] as const;

// Each monetary input is uint256-bounded; a report can sum many valid inputs.
function formatAggregate(value: string, decimals: number) {
  const canonical = BigInt(value).toString();
  if (!decimals) return canonical;
  const padded = canonical.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return padded.slice(0, -decimals) + (fraction ? "." + fraction : "");
}

/** Nulls identify work still required; no identities, consents, amounts, or outcomes are fabricated. */
export function createPilotTemplates() {
  return {
    study: pilotDraftSchema.parse({
      schemaVersion: 1, studyId: null, adjudicatorId: null,
      settlementAsset: null, operatingCostAsset: null, consents: [], cases: [],
    }),
    case: pilotCaseDraftSchema.parse(Object.fromEntries(Object.keys(caseFields).map((key) => [key, null]))),
    measurement: pilotMeasurementDraftSchema.parse(Object.fromEntries(Object.keys(measurementFields).map((key) => [key, null]))),
  };
}

function activeGrant(grant: Consent["localAnalysis"], at: string) {
  return grant !== null && Date.parse(grant.grantedAt) <= Date.parse(at) &&
    (grant.revokedAt === null || Date.parse(grant.revokedAt) > Date.parse(at));
}
function consentFor(c: { businessId: string; cohort: string }, consents: Consent[], at: string) {
  if (c.cohort === "synthetic") return null;
  const record = consents.find((row) => row.businessId === c.businessId);
  if (!record || !activeGrant(record.localAnalysis, at))
    throw new Error(`Active local-analysis consent required for business ${c.businessId}`);
  return record.localAnalysis!.evidenceId;
}
function validateConsents(consents: Consent[]) {
  const seen = new Set<string>();
  for (const record of consents) {
    if (seen.has(record.businessId)) throw new Error("Duplicate business consent record");
    seen.add(record.businessId);
    for (const grant of [record.localAnalysis, record.publication]) {
      if (grant?.revokedAt !== null && grant?.revokedAt !== undefined && Date.parse(grant.revokedAt) < Date.parse(grant.grantedAt))
        throw new Error("Consent revocation predates its grant");
    }
  }
}
function validateCase(c: z.infer<typeof pilotCase>, frozenAt: string) {
  if (Date.parse(c.snapshot.asOf) > Date.parse(frozenAt))
    throw new Error("Case snapshot exceeds the frozen point-in-time input");
  if (new Set(c.snapshot.evidenceIds).size !== c.snapshot.evidenceIds.length)
    throw new Error("Duplicate snapshot evidence identity");
  if (atomic(c.incorrectIncrementalUnits) > atomic(c.obligationUnits) ||
      (c.label !== "confirmed-problem" && c.incorrectIncrementalUnits !== "0"))
    throw new Error("Incorrect increment must be adjudicated and cannot exceed the obligation");
}

/** A separate salt per private input limits low-entropy hash guessing. Keep the salted inputs private. */
export function freezePilot(value: unknown, frozenAt: string): PilotSession {
  const parsed = preparedStudy.parse(value);
  date.parse(frozenAt);
  validateConsents(parsed.consents);
  const seen = new Set<string>();
  const cases = parsed.cases.map((c) => {
    if (seen.has(c.caseId)) throw new Error("Duplicate frozen case identity");
    seen.add(c.caseId);
    validateCase(c, frozenAt);
    const consentEvidenceId = consentFor(c, parsed.consents, frozenAt);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const salt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const salted = { ...c.snapshot, salt };
    return { ...c, snapshot: salted, inputCommitment: commitment(salted), consentEvidenceId };
  });
  const data = frozenData.parse({
    schemaVersion: 1, studyId: parsed.studyId, adjudicatorId: parsed.adjudicatorId,
    settlementAsset: parsed.settlementAsset, operatingCostAsset: parsed.operatingCostAsset,
    frozenAt, cases,
  });
  return { schemaVersion: 1, frozen: { data, commitment: commitment(data) }, consents: parsed.consents, measurements: [] };
}

function validateMeasurement(result: PilotMeasurement, c: FrozenCase, frozenAt: string, now: string) {
  if (result.inputCommitment !== c.inputCommitment)
    throw new Error("Measurement input must match the frozen point-in-time case");
  const start = Date.parse(result.reviewStartedAt), end = Date.parse(result.reviewEndedAt), observed = Date.parse(result.observedAt);
  if (observed > Date.parse(now)) throw new Error("Future measurements cannot be recorded");
  if (start < Date.parse(frozenAt) || end < start || observed < end || result.pausedMilliseconds > end - start)
    throw new Error("Invalid timing measurement: review after freeze, end after start, pause within elapsed time, and observation after review are required");
  if (!result.appliedToWorkflow && (result.settlement || result.repeatCycleEvidenceId || result.preventedEvidenceId || result.dueOutcome !== "not-observed"))
    throw new Error("A comparison-only arm cannot claim workflow outcomes, settlement, prevention, or repeat use");
  if (result.preventedEvidenceId && (c.label !== "confirmed-problem" || c.incorrectIncrementalUnits === "0" || result.action === "PAY"))
    throw new Error("Prevention requires a confirmed incorrect increment, applied non-PAY action, and independent evidence");
  const due = Date.parse(c.dueAt);
  if (result.settlement) {
    const delivered = Date.parse(result.settlement.deliveredAt);
    const earliest = c.cohort === "historical-replay" ? Date.parse(c.snapshot.asOf) : end;
    if (atomic(result.settlement.units) === 0n || delivered < earliest || delivered > observed)
      throw new Error("Settlement amount or destination delivery time is inconsistent with the obligation");
    if (c.cohort === "historical-replay" && result.arm !== "prior-workflow")
      throw new Error("Historical settlement evidence belongs to the observed prior workflow only");
  }
  if (result.dueOutcome === "on-time" || result.dueOutcome === "late") {
    if (!result.settlement || atomic(result.settlement.units) < atomic(c.obligationUnits) ||
        (result.dueOutcome === "on-time" ? Date.parse(result.settlement.deliveredAt) > due : Date.parse(result.settlement.deliveredAt) <= due))
      throw new Error("Due outcome requires complete destination settlement evidence consistent with the due date");
  }
  if ((result.dueOutcome === "unpaid" && (observed < due || (result.settlement !== null && atomic(result.settlement.units) >= atomic(c.obligationUnits)))) ||
      (result.dueOutcome === "not-due" && observed >= due))
    throw new Error("Due outcome is inconsistent with the observation time or completed obligation");
  if (result.dueOutcome === "not-observed" && (result.settlement || result.repeatCycleEvidenceId || result.preventedEvidenceId))
    throw new Error("Unobserved outcomes cannot claim observed settlement, repeat use, or prevention");
}

function validateSession(value: unknown, now: string, trusted?: string): PilotSession {
  date.parse(now);
  const session = sessionSchema.parse(value);
  const { data } = session.frozen;
  if (commitment(data) !== session.frozen.commitment || (trusted !== undefined && trusted !== session.frozen.commitment))
    throw new Error("Frozen pilot commitment mismatch");
  if (Date.parse(data.frozenAt) > Date.parse(now)) throw new Error("Future pilot freeze cannot be evaluated");
  validateConsents(session.consents);
  const cases = new Map<string, FrozenCase>();
  for (const c of data.cases) {
    if (cases.has(c.caseId)) throw new Error("Duplicate frozen case identity");
    cases.set(c.caseId, c);
    validateCase(c, data.frozenAt);
    if (commitment(c.snapshot) !== c.inputCommitment) throw new Error("Frozen input commitment mismatch");
    if (consentFor(c, session.consents, now) !== c.consentEvidenceId)
      throw new Error("The current local-analysis consent must match the frozen consent evidence");
  }
  const seen = new Set<string>(), applied = new Set<string>();
  const payments = new Map<string, { caseId: string; cohort: string; units: string }>();
  for (const result of session.measurements) {
    const c = cases.get(result.caseId);
    if (!c) throw new Error("Measurement references an unknown frozen case");
    const key = `${result.caseId}/${result.arm}`;
    if (seen.has(key)) throw new Error("Duplicate case/arm measurement");
    seen.add(key);
    if (result.appliedToWorkflow) {
      if (applied.has(c.caseId)) throw new Error("Only one applied arm may claim outcomes for an obligation");
      applied.add(c.caseId);
    }
    consentFor(c, session.consents, result.observedAt);
    validateMeasurement(result, c, data.frozenAt, now);
    if (result.settlement) {
      const prior = payments.get(result.settlement.paymentId);
      if (prior && (prior.caseId !== c.caseId || prior.cohort !== c.cohort || prior.units !== result.settlement.units))
        throw new Error("A stable payment identity cannot be reused across obligations, amounts, or cohorts");
      payments.set(result.settlement.paymentId, { caseId: c.caseId, cohort: c.cohort, units: result.settlement.units });
    }
  }
  return session;
}

export function inspectPilot(value: unknown, now: string, trusted?: string) {
  const session = validateSession(value, now, trusted);
  const present = new Set(session.measurements.map((row) => `${row.caseId}/${row.arm}`));
  const missingMeasurements = session.frozen.data.cases.flatMap((c) => arms.filter((arm) => !present.has(`${c.caseId}/${arm}`)).map((arm) => ({ caseId: c.caseId, arm })));
  return {
    studyId: session.frozen.data.studyId,
    frozenCommitment: session.frozen.commitment,
    externallyAnchored: trusted === session.frozen.commitment,
    cases: session.frozen.data.cases.length,
    measurements: session.measurements.length,
    complete: missingMeasurements.length === 0,
    missingMeasurements,
  };
}

/** Returns a new session; CLI writes it to a new path so earlier capture files are preserved. */
export function recordPilotMeasurement(value: unknown, observation: unknown, now: string) {
  const session = validateSession(value, now);
  const next = { ...session, measurements: [...session.measurements, measurement.parse(observation)] };
  return validateSession(next, now);
}

export function evaluatePilot(value: unknown, exportedAt: string, trusted?: string) {
  const session = validateSession(value, exportedAt, trusted);
  const { data } = session.frozen;
  const cases = new Map(data.cases.map((c) => [c.caseId, c]));
  const manifest = {
    schemaVersion: 1 as const, id: data.studyId, adjudicator: data.adjudicatorId,
    frozenAt: data.frozenAt, split: "held-out" as const,
    cases: data.cases.map((c) => ({
      caseId: c.caseId, businessId: c.businessId, vendorId: c.vendorId,
      cohort: c.cohort, label: c.label, inputCommitment: c.inputCommitment,
      asOf: c.snapshot.asOf, incorrectIncrementalUnits: c.incorrectIncrementalUnits,
    })),
  };
  const results = session.measurements.map((r) => ({
    caseId: r.caseId, inputCommitment: r.inputCommitment, arm: r.arm, action: r.action,
    humanMinutes: (Date.parse(r.reviewEndedAt) - Date.parse(r.reviewStartedAt) - r.pausedMilliseconds) / 60_000,
    costUnits: r.costUnits, settledUnits: r.settlement?.units ?? "0",
    onTime: r.dueOutcome === "on-time", repeatCycle: r.repeatCycleEvidenceId !== null,
    preventedConfirmed: r.preventedEvidenceId !== null,
    ...(r.settlement ? { paymentId: r.settlement.paymentId } : {}),
    timingEvidenceId: r.timingEvidenceId, observedAt: r.observedAt,
  }));
  const experiment = { manifest, manifestCommitment: commitment(manifest), results };
  const evaluation = evaluateExperiment(experiment, trusted === session.frozen.commitment ? experiment.manifestCommitment : undefined);
  const dueGroups = new Map<string, PilotMeasurement[]>();
  const settlementGroups = new Map<string, Map<string, { units: string; excess: string }>>();
  for (const r of session.measurements) {
    const c = cases.get(r.caseId)!;
    const key = `${c.cohort}/${r.arm}`;
    dueGroups.set(key, [...(dueGroups.get(key) ?? []), r]);
    if (!settlementGroups.has(c.cohort)) settlementGroups.set(c.cohort, new Map());
    if (r.settlement) {
      const excess = atomic(r.settlement.units) - atomic(c.obligationUnits);
      settlementGroups.get(c.cohort)!.set(r.settlement.paymentId, {
        units: r.settlement.units, excess: excess > 0n ? excess.toString() : "0",
      });
    }
  }
  const dueResults = [...dueGroups].map(([key, rows]) => {
    const [cohort, arm] = key.split("/");
    const count = (outcome: PilotMeasurement["dueOutcome"]) => rows.filter((r) => r.dueOutcome === outcome).length;
    const observedDueCases = count("on-time") + count("late") + count("unpaid");
    return {
      cohort, arm, appliedCases: rows.filter((r) => r.appliedToWorkflow).length,
      onTime: count("on-time"), late: count("late"), unpaid: count("unpaid"),
      notDue: count("not-due"), unknown: count("unknown"), notObserved: count("not-observed"),
      observedDueCases, onTimeRate: observedDueCases ? count("on-time") / observedDueCases : null,
    };
  });
  const settlements = [...settlementGroups].map(([cohort, payments]) => {
    const units = [...payments.values()].reduce((sum, value) => sum + atomic(value.units), 0n).toString();
    const excessUnits = [...payments.values()].reduce((sum, value) => sum + atomic(value.excess), 0n).toString();
    return {
      cohort, payments: payments.size, units, formatted: formatAggregate(units, data.settlementAsset.decimals),
      excessUnits, excessFormatted: formatAggregate(excessUnits, data.settlementAsset.decimals),
    };
  });
  const measurements = session.measurements.map((r, i) => {
    const c = cases.get(r.caseId)!;
    return {
      ...r, humanMinutes: results[i].humanMinutes, businessId: c.businessId,
      vendorId: c.vendorId, cohort: c.cohort, label: c.label,
      obligationUnits: c.obligationUnits, dueAt: c.dueAt,
      excessSettlementUnits: r.settlement && atomic(r.settlement.units) > atomic(c.obligationUnits)
        ? (atomic(r.settlement.units) - atomic(c.obligationUnits)).toString() : "0",
      adjudicationEvidenceId: c.adjudicationEvidenceId,
    };
  });
  const realBusinesses = [...new Set(data.cases.filter((c) => c.cohort !== "synthetic").map((c) => c.businessId))];
  return {
    schemaVersion: 1, studyId: data.studyId, exportedAt, privateByDefault: true,
    frozenCommitment: session.frozen.commitment, externallyAnchored: trusted === session.frozen.commitment,
    settlementAsset: data.settlementAsset, operatingCostAsset: data.operatingCostAsset,
    publicationConsentComplete: realBusinesses.length > 0 && realBusinesses.every((businessId) => activeGrant(session.consents.find((c) => c.businessId === businessId)?.publication ?? null, exportedAt)),
    experiment, evaluation, dueResults, settlements, measurements,
    limitations: [
      ...evaluation.limitations,
      "Consent and evidence references are operator-supplied; local validation does not verify their truth, custody, scope, or current external status.",
      "One applied arm per case may claim workflow outcomes; comparison-only arms provide review measurements without invented settlement or repeat use.",
      "Not-due, unknown, and not-observed outcomes are excluded from on-time completion denominators.",
      "Amounts are exact units of the explicitly selected assets. Cohorts are never pooled into a combined traction or settlement total.",
      "Recorded delivery above the frozen obligation is shown separately as excess; a numeric excess alone does not prove loss, fraud, or the independently adjudicated incorrect increment.",
      "Historical and synthetic outcomes cannot establish present customer traction. Private reports require separate consent and redaction review before publication.",
    ],
  };
}
export type PilotReport = ReturnType<typeof evaluatePilot>;

function csvCell(value: unknown, exactText = false) {
  const text = String(value ?? "");
  const safe = exactText || /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
/** JSON is the authoritative exact-value export. CSV protects amounts/identities from spreadsheet coercion. */
export function renderPilotCsv(report: PilotReport) {
  const headers = ["case_id", "business_id", "vendor_id", "cohort", "arm", "label", "action", "human_minutes", "cost_asset", "cost_units", "settlement_asset", "obligation_units", "applied_to_workflow", "due_at", "due_outcome", "payment_id", "settled_units", "excess_settlement_units", "destination_delivered_at", "timing_evidence_id", "decision_evidence_id", "cost_evidence_id", "settlement_evidence_id", "repeat_evidence_id", "prevention_evidence_id", "observed_at"];
  return [headers.map((v) => csvCell(v)).join(","), ...report.measurements.map((r) => [
    csvCell(r.caseId, true), csvCell(r.businessId, true), csvCell(r.vendorId, true),
    csvCell(r.cohort), csvCell(r.arm), csvCell(r.label), csvCell(r.action), csvCell(r.humanMinutes),
    csvCell(report.operatingCostAsset.id), csvCell(r.costUnits, true),
    csvCell(report.settlementAsset.id), csvCell(r.obligationUnits, true), csvCell(r.appliedToWorkflow),
    csvCell(r.dueAt), csvCell(r.dueOutcome), csvCell(r.settlement?.paymentId, true),
    csvCell(r.settlement?.units ?? "0", true), csvCell(r.excessSettlementUnits, true), csvCell(r.settlement?.deliveredAt),
    csvCell(r.timingEvidenceId, true), csvCell(r.decisionEvidenceId, true), csvCell(r.costEvidenceId, true),
    csvCell(r.settlement?.evidenceId, true), csvCell(r.repeatCycleEvidenceId, true), csvCell(r.preventedEvidenceId, true), csvCell(r.observedAt),
  ].join(","))].join("\n") + "\n";
}
function md(value: unknown) {
  return String(value ?? "unmeasured").replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>|])/g, "\\$1");
}
const cohortLabels: Record<string, string> = {
  synthetic: "Synthetic", "historical-replay": "Historical replay",
  "founder-mainnet": "Founder mainnet", "founder-testnet": "Founder testnet",
  "independent-mainnet": "Independent mainnet", "independent-testnet": "Independent testnet",
};
export function renderPilotMarkdown(report: PilotReport) {
  return [
    `# Private pilot report: ${md(report.studyId)}`, "",
    `Exported ${md(report.exportedAt)}. Frozen commitment: ${report.frozenCommitment}.`, "",
    "This is an operator-supplied descriptive measurement report. No model, notice, or payment was invoked by the capture tool. Separate publication consent and redaction review are required.", "",
    `Settlement asset: ${md(report.settlementAsset.label)} (${md(report.settlementAsset.id)}; ${report.settlementAsset.decimals} decimals). Operating cost asset: ${md(report.operatingCostAsset.label)} (${md(report.operatingCostAsset.id)}; ${report.operatingCostAsset.decimals} decimals).`, "",
    "## Review results", "",
    "| Cohort | Arm | Cases | Median minutes | False holds / valid cases | Missed / confirmed issues | Disputed | Operating cost |", "|---|---|---:|---:|---:|---:|---:|---:|",
    ...report.evaluation.metrics.map((r) => {
      const rows = report.measurements.filter((m) => m.cohort === r.cohort && m.arm === r.arm);
      const valid = rows.filter((m) => m.label === "valid").length;
      const problems = rows.filter((m) => m.label === "confirmed-problem").length;
      return `| ${cohortLabels[r.cohort]} | ${r.arm} | ${r.sampleSize} | ${md(r.medianHumanMinutes)} | ${valid ? `${r.falseHolds}/${valid}` : "unmeasured"} | ${problems ? `${r.missedProblems}/${problems}` : "unmeasured"} | ${r.disputedLabels} | ${formatAggregate(r.operatingCostUnits, report.operatingCostAsset.decimals)} |`;
    }), "",
    "## Observed due outcomes", "",
    "Only the applied workflow can claim outcomes. Unknown, not due, and unobserved cases remain outside the completion denominator.", "",
    "| Cohort | Arm | On time | Late | Unpaid/incomplete | Not due | Unknown | Not observed | Completion denominator |", "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.dueResults.map((r) => `| ${cohortLabels[r.cohort]} | ${r.arm} | ${r.onTime} | ${r.late} | ${r.unpaid} | ${r.notDue} | ${r.unknown} | ${r.notObserved} | ${r.observedDueCases} |`), "",
    "## Destination settlement evidence", "",
    "| Cohort | Stable payment identities | Exact amount | Recorded excess above obligation |", "|---|---:|---:|---:|",
    ...report.settlements.map((r) => `| ${cohortLabels[r.cohort]} | ${r.payments} | ${r.formatted} | ${r.excessFormatted} |`), "",
    "## Limits", "", ...report.limitations.map((value) => `- ${value}`), "",
  ].join("\n");
}
