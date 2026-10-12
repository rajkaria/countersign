import { describe, expect, it } from "vitest";
import {
  createPilotTemplates,
  evaluatePilot,
  freezePilot,
  inspectPilot,
  pilotCaseDraftSchema,
  pilotDraftSchema,
  pilotMeasurementDraftSchema,
  recordPilotMeasurement,
  renderPilotCsv,
  renderPilotMarkdown,
} from "../../src/lib/domain/pilot";

const frozenAt = "2026-10-13T09:00:00Z";
const now = "2026-10-13T12:00:00Z";
function draft(cohort = "synthetic") {
  return {
    schemaVersion: 1,
    studyId: "test-fixture-study",
    adjudicatorId: "fixture-adjudicator",
    settlementAsset: { id: "USDC/base-sepolia", label: "Test USDC", decimals: 6 },
    operatingCostAsset: { id: "USD", label: "US dollars", decimals: 2 },
    consents: [
      {
        businessId: "fixture-business",
        localAnalysis: {
          evidenceId: "fixture-local-consent",
          grantedAt: "2026-10-12T00:00:00Z",
          revokedAt: null as string | null,
        },
        publication: null,
      },
    ],
    cases: [
      {
        caseId: "fixture-case",
        businessId: "fixture-business",
        vendorId: "fixture-vendor",
        cohort,
        label: "valid",
        incorrectIncrementalUnits: "0",
        obligationUnits: "9007199254740993123456",
        dueAt: "2026-10-13T11:00:00Z",
        adjudicationEvidenceId: "fixture-label-evidence",
        snapshot: {
          asOf: "2026-10-12T08:00:00Z",
          evidenceIds: ["fixture-agreement", "fixture-invoice"],
          content: { invoice: { units: "9007199254740993123456" } },
        },
      },
    ],
  };
}
function measurement(
  session: ReturnType<typeof freezePilot>,
  arm = "prior-workflow",
) {
  return {
    caseId: "fixture-case",
    inputCommitment: session.frozen.data.cases[0].inputCommitment,
    arm,
    operatorId: "fixture-operator",
    action: "HOLD",
    reviewStartedAt: "2026-10-13T09:01:00Z",
    reviewEndedAt: "2026-10-13T09:04:00Z",
    pausedMilliseconds: 30_000,
    timingEvidenceId: `fixture-timing-${arm}`,
    decisionEvidenceId: `fixture-decision-${arm}`,
    costUnits: "125",
    costEvidenceId: `fixture-cost-${arm}`,
    appliedToWorkflow: false,
    dueOutcome: "not-observed",
    settlement: null,
    repeatCycleEvidenceId: null,
    preventedEvidenceId: null,
    observedAt: "2026-10-13T11:30:00Z",
  };
}
function complete() {
  let session = freezePilot(draft(), frozenAt);
  for (const arm of ["prior-workflow", "rules", "rules-agent"])
    session = recordPilotMeasurement(session, measurement(session, arm), now);
  return session;
}

describe("portable pilot capture", () => {
  it("creates valid empty drafts with no invented identity, measurement, consent, or outcome", () => {
    const templates = createPilotTemplates();
    expect(pilotDraftSchema.parse(templates.study)).toEqual(templates.study);
    expect(pilotCaseDraftSchema.parse(templates.case)).toEqual(templates.case);
    expect(pilotMeasurementDraftSchema.parse(templates.measurement)).toEqual(
      templates.measurement,
    );
    expect(templates.study.cases).toEqual([]);
    expect(templates.study.consents).toEqual([]);
    expect(templates.measurement.costUnits).toBeNull();
    expect(templates.measurement.dueOutcome).toBeNull();
    expect(() => freezePilot(templates.study, frozenAt)).toThrow();
  });

  it("requires local-analysis consent for real and historical business information", () => {
    for (const cohort of ["founder-testnet", "independent-mainnet", "historical-replay"]) {
      const value = { ...draft(cohort), consents: [] };
      expect(() => freezePilot(value, frozenAt)).toThrow(/consent/i);
    }
    const revoked = draft("founder-testnet");
    revoked.consents[0].localAnalysis.revokedAt = "2026-10-12T12:00:00Z";
    expect(() => freezePilot(revoked, frozenAt)).toThrow(/consent/i);
    const future = draft("founder-testnet");
    future.consents[0].localAnalysis.grantedAt = now;
    expect(() => freezePilot(future, frozenAt)).toThrow(/consent/i);
  });

  it("salts private snapshots, binds point-in-time data, and rejects frozen tampering", () => {
    const session = freezePilot(draft(), frozenAt);
    const other = freezePilot(draft(), frozenAt);
    expect(session.frozen.data.cases[0].snapshot.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(other.frozen.commitment).not.toBe(session.frozen.commitment);
    expect(inspectPilot(session, now).missingMeasurements).toHaveLength(3);
    const changed = structuredClone(session);
    changed.frozen.data.cases[0].snapshot.content = { altered: true };
    expect(() => inspectPilot(changed, now)).toThrow(/commitment/i);
    const value = draft();
    value.cases[0].snapshot.asOf = now;
    expect(() => freezePilot(value, frozenAt)).toThrow(/point-in-time/i);
  });

  it("rejects unknown cases, duplicate arms, and changed inputs", () => {
    const session = freezePilot(draft(), frozenAt);
    const once = recordPilotMeasurement(session, measurement(session), now);
    expect(() => recordPilotMeasurement(once, measurement(session), now)).toThrow(/duplicate/i);
    expect(() => recordPilotMeasurement(session, { ...measurement(session), caseId: "unknown" }, now)).toThrow(/case/i);
    expect(() => recordPilotMeasurement(session, { ...measurement(session), inputCommitment: "0x" + "11".repeat(32) }, now)).toThrow(/input/i);
    expect(() => evaluatePilot(once, now)).toThrow(/all three/i);
  });

  it("derives measured minutes from timestamps and refuses impossible or future timings", () => {
    const session = complete();
    expect(evaluatePilot(session, now).evaluation.metrics[0].medianHumanMinutes).toBe(2.5);
    const empty = freezePilot(draft(), frozenAt);
    expect(() => recordPilotMeasurement(empty, { ...measurement(empty), pausedMilliseconds: 181_000 }, now)).toThrow(/timing/i);
    expect(() => recordPilotMeasurement(empty, { ...measurement(empty), reviewStartedAt: "2026-10-13T08:00:00Z" }, now)).toThrow(/timing/i);
    expect(() => recordPilotMeasurement(empty, { ...measurement(empty), observedAt: "2026-10-14T00:00:00Z" }, now)).toThrow(/future/i);
  });

  it("keeps unknown due outcomes outside completion denominators", () => {
    const report = evaluatePilot(complete(), now);
    expect(report.dueResults).toHaveLength(3);
    for (const row of report.dueResults) {
      expect(row.notObserved).toBe(1);
      expect(row.observedDueCases).toBe(0);
      expect(row.onTimeRate).toBeNull();
    }
    expect(report.settlements[0].units).toBe("0");
    expect(report.privateByDefault).toBe(true);
  });

  it("binds due outcomes to actual destination evidence and counts a payment once", () => {
    let session = freezePilot(draft("founder-testnet"), frozenAt);
    const applied = {
      ...measurement(session),
      action: "PAY",
      appliedToWorkflow: true,
      dueOutcome: "on-time",
      settlement: {
        paymentId: "fixture-payment",
        units: "9007199254740993123456",
        deliveredAt: "2026-10-13T10:00:00Z",
        evidenceId: "fixture-destination-evidence",
      },
    };
    session = recordPilotMeasurement(session, applied, now);
    for (const arm of ["rules", "rules-agent"])
      session = recordPilotMeasurement(session, measurement(session, arm), now);
    const report = evaluatePilot(session, now);
    expect(report.settlements[0].units).toBe("9007199254740993123456");
    expect(report.settlements[0].formatted).toBe("9007199254740993.123456");
    expect(report.dueResults[0].onTimeRate).toBe(1);
    const empty = freezePilot(draft("founder-testnet"), frozenAt);
    expect(() => recordPilotMeasurement(empty, { ...applied, inputCommitment: empty.frozen.data.cases[0].inputCommitment, settlement: { ...applied.settlement, deliveredAt: "2026-10-13T11:10:00Z" } }, now)).toThrow(/due/i);
  });

  it("refuses to attribute execution, avoided amounts, or repeat use to an unapplied comparison arm", () => {
    const session = freezePilot(draft(), frozenAt);
    expect(() => recordPilotMeasurement(session, { ...measurement(session), dueOutcome: "unpaid" }, now)).toThrow(/comparison/i);
    expect(() => recordPilotMeasurement(session, { ...measurement(session), repeatCycleEvidenceId: "fixture-repeat" }, now)).toThrow(/comparison/i);
    expect(() => recordPilotMeasurement(session, { ...measurement(session), preventedEvidenceId: "fixture-prevention" }, now)).toThrow(/comparison/i);
  });

  it("rejects multiple applied arms for the same obligation", () => {
    let session = freezePilot(draft(), frozenAt);
    session = recordPilotMeasurement(session, { ...measurement(session), appliedToWorkflow: true, dueOutcome: "unpaid" }, now);
    expect(() => recordPilotMeasurement(session, { ...measurement(session, "rules"), appliedToWorkflow: true, dueOutcome: "unpaid" }, now)).toThrow(/applied arm/i);
  });

  it("rechecks editable consent and requires a separate publication grant", () => {
    let session = freezePilot(draft("founder-testnet"), frozenAt);
    for (const arm of ["prior-workflow", "rules", "rules-agent"])
      session = recordPilotMeasurement(session, measurement(session, arm), now);
    expect(evaluatePilot(session, now).publicationConsentComplete).toBe(false);
    session.consents[0].localAnalysis!.revokedAt = "2026-10-13T11:45:00Z";
    expect(() => evaluatePilot(session, now)).toThrow(/consent/i);
  });

  it("never combines payment identities across cohorts or silently changes amount precision", () => {
    const value = draft();
    value.cases[0].incorrectIncrementalUnits = "1";
    expect(() => freezePilot(value, frozenAt)).toThrow(/incorrect increment/i);
    value.cases[0].incorrectIncrementalUnits = "0";
    value.cases[0].obligationUnits = (1n << 256n).toString();
    expect(() => freezePilot(value, frozenAt)).toThrow();
    value.cases[0].obligationUnits = "01";
    expect(() => freezePilot(value, frozenAt)).toThrow();
  });

  it("rejects reuse of one destination payment across different obligations or cohorts", () => {
    const value = draft("founder-testnet");
    value.cases.push({ ...value.cases[0], caseId: "fixture-case-2", cohort: "independent-testnet" });
    let session = freezePilot(value, frozenAt);
    const settled = {
      ...measurement(session), action: "PAY", appliedToWorkflow: true, dueOutcome: "on-time",
      settlement: { paymentId: "fixture-payment", units: value.cases[0].obligationUnits, deliveredAt: "2026-10-13T10:00:00Z", evidenceId: "fixture-delivery" },
    };
    session = recordPilotMeasurement(session, settled, now);
    expect(() => recordPilotMeasurement(session, {
      ...settled, caseId: "fixture-case-2", inputCommitment: session.frozen.data.cases[1].inputCommitment,
    }, now)).toThrow(/payment identity/i);
  });

  it("keeps partial obligations incomplete and permits independently referenced historical delivery only for the prior workflow", () => {
    const value = draft("historical-replay");
    const session = freezePilot(value, frozenAt);
    const historical = {
      ...measurement(session), appliedToWorkflow: true, dueOutcome: "unpaid",
      settlement: { paymentId: "fixture-history", units: "1000000", deliveredAt: "2026-10-12T09:00:00Z", evidenceId: "fixture-history-delivery" },
    };
    expect(recordPilotMeasurement(session, historical, now).measurements).toHaveLength(1);
    expect(() => recordPilotMeasurement(session, { ...historical, dueOutcome: "on-time" }, now)).toThrow(/complete destination/i);
    expect(() => recordPilotMeasurement(session, { ...historical, arm: "rules" }, now)).toThrow(/prior workflow/i);
  });

  it("captures a mistaken overpayment instead of rejecting the observed error as impossible", () => {
    const value = draft("founder-testnet");
    value.cases[0].label = "confirmed-problem";
    value.cases[0].incorrectIncrementalUnits = "1";
    let session = freezePilot(value, frozenAt);
    session = recordPilotMeasurement(session, {
      ...measurement(session), action: "PAY", appliedToWorkflow: true, dueOutcome: "on-time",
      settlement: { paymentId: "fixture-overpayment", units: (BigInt(value.cases[0].obligationUnits) + 1n).toString(), deliveredAt: "2026-10-13T10:00:00Z", evidenceId: "fixture-destination-error" },
    }, now);
    for (const arm of ["rules", "rules-agent"])
      session = recordPilotMeasurement(session, measurement(session, arm), now);
    const report = evaluatePilot(session, now);
    expect(report.evaluation.metrics[0].missedProblems).toBe(1);
    expect(report.measurements[0].excessSettlementUnits).toBe("1");
    expect(report.settlements[0].excessUnits).toBe("1");
  });

  it("does not silently round floating-point private inputs or aggregate exact monetary totals", () => {
    const value = draft();
    value.cases[0].snapshot.content = { fractional: 1.1 } as never;
    expect(() => freezePilot(value, frozenAt)).toThrow(/safe integers/i);
    const max = ((1n << 256n) - 1n).toString();
    const large = draft();
    large.cases[0].obligationUnits = max;
    large.cases.push({ ...large.cases[0], caseId: "fixture-case-2" });
    let session = freezePilot(large, frozenAt);
    for (const c of session.frozen.data.cases)
      for (const arm of ["prior-workflow", "rules", "rules-agent"])
        session = recordPilotMeasurement(session, { ...measurement(session, arm), caseId: c.caseId, inputCommitment: c.inputCommitment, costUnits: max }, now);
    expect(() => renderPilotMarkdown(evaluatePilot(session, now))).not.toThrow();
  });

  it("exports exact text amounts and escapes spreadsheet formulas without exposing input content", () => {
    const report = evaluatePilot(complete(), now);
    const csv = renderPilotCsv(report);
    expect(csv).toContain("'9007199254740993123456");
    expect(csv).not.toContain('"invoice":');
    expect(renderPilotMarkdown(report)).toContain("Synthetic");
    const value = draft();
    value.cases[0].vendorId = "=HYPERLINK(\"https://invalid.example\")";
    let session = freezePilot(value, frozenAt);
    for (const arm of ["prior-workflow", "rules", "rules-agent"])
      session = recordPilotMeasurement(session, measurement(session, arm), now);
    expect(renderPilotCsv(evaluatePilot(session, now))).toContain("'=HYPERLINK");
  });
});
