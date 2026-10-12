import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { runPilotCli } from "../../scripts/pilot";
import { createPilotTemplates, freezePilot } from "../../src/lib/domain/pilot";

const directories: string[] = [];
const now = "2026-10-13T12:00:00Z";
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "countersign-pilot-test-"));
  directories.push(dir);
  return dir;
}
function study() {
  return {
    ...createPilotTemplates().study,
    studyId: "synthetic-cli-fixture",
    adjudicatorId: "fixture-adjudicator",
    settlementAsset: { id: "test-usdc", label: "Test USDC", decimals: 6 },
    operatingCostAsset: { id: "usd", label: "USD", decimals: 2 },
    cases: [{
      caseId: "fixture-case", businessId: "fixture-business", vendorId: "fixture-vendor",
      cohort: "synthetic", label: "valid", incorrectIncrementalUnits: "0", obligationUnits: "1000000",
      dueAt: "2026-10-14T00:00:00Z", adjudicationEvidenceId: "fixture-label",
      snapshot: { asOf: "2026-10-12T00:00:00Z", evidenceIds: ["fixture-source"], content: { privateFixture: "must-stay-private" } },
    }],
  };
}

it("initializes private, valid empty templates and refuses to overwrite a kit", async () => {
  const parent = await directory(), kit = join(parent, "kit");
  await runPilotCli(["init", kit], now);
  const draft = JSON.parse(await readFile(join(kit, "pilot.json"), "utf8"));
  expect(draft).toEqual(createPilotTemplates().study);
  if (process.platform !== "win32") {
    expect((await stat(kit)).mode & 0o777).toBe(0o700);
    expect((await stat(join(kit, "pilot.json"))).mode & 0o777).toBe(0o600);
  }
  await expect(runPilotCli(["init", kit], now)).rejects.toThrow();
  expect(await runPilotCli(["help"], now)).toContain("freeze");
});

it("writes new capture revisions and reuses the existing evaluator export without private snapshots", async () => {
  const dir = await directory();
  const input = join(dir, "pilot.json"), sessionFile = join(dir, "session.json");
  await writeFile(input, JSON.stringify(study()));
  await runPilotCli(["freeze", input, sessionFile], "2026-10-13T09:00:00Z");
  let current = sessionFile;
  let session = JSON.parse(await readFile(current, "utf8"));
  let revision = 0;
  for (const arm of ["prior-workflow", "rules", "rules-agent"]) {
    const observation = {
      caseId: "fixture-case", inputCommitment: session.frozen.data.cases[0].inputCommitment,
      arm, operatorId: "fixture-operator", action: "HOLD",
      reviewStartedAt: "2026-10-13T10:00:00Z", reviewEndedAt: "2026-10-13T10:02:00Z",
      pausedMilliseconds: 0, timingEvidenceId: "fixture-timer", decisionEvidenceId: "fixture-decision",
      costUnits: "0", costEvidenceId: "fixture-zero-cost-note", appliedToWorkflow: false,
      dueOutcome: "not-observed", settlement: null, repeatCycleEvidenceId: null, preventedEvidenceId: null,
      observedAt: "2026-10-13T10:03:00Z",
    };
    const measurementFile = join(dir, `measurement-${++revision}.json`);
    const next = join(dir, `session-${revision}.json`);
    await writeFile(measurementFile, JSON.stringify(observation));
    await runPilotCli(["record", current, measurementFile, next], now);
    current = next;
    session = JSON.parse(await readFile(current, "utf8"));
  }
  const status = JSON.parse(await runPilotCli(["check", current], now));
  expect(status.complete).toBe(true);
  const out = join(dir, "report");
  await runPilotCli(["export", current, out, session.frozen.commitment], now);
  const report = await readFile(join(out, "report.json"), "utf8");
  expect(report).not.toContain("must-stay-private");
  expect(JSON.parse(report).externallyAnchored).toBe(true);
  expect(JSON.parse(await readFile(join(out, "experiment.json"), "utf8")).results).toHaveLength(3);
  expect(await readFile(join(out, "measurements.csv"), "utf8")).toContain("'1000000");
  await expect(runPilotCli(["export", current, out], now)).rejects.toThrow();
  await expect(runPilotCli(["freeze", input, sessionFile], now)).rejects.toThrow();
});

it("rejects unknown commands and malformed or incomplete captures before creating report output", async () => {
  const dir = await directory(), input = join(dir, "session.json"), output = join(dir, "report");
  await writeFile(input, JSON.stringify(freezePilot(study(), "2026-10-13T09:00:00Z")));
  await expect(runPilotCli(["export", input, output], now)).rejects.toThrow(/all three/i);
  await expect(stat(output)).rejects.toThrow();
  await expect(runPilotCli(["pay", input], now)).rejects.toThrow(/usage/i);
});

it("keeps private pilot outputs outside the application source checkout", async () => {
  const inside = fileURLToPath(new URL(`../../.pilot-cli-fixture-${Date.now()}`, import.meta.url));
  directories.push(inside);
  await expect(runPilotCli(["init", inside], now)).rejects.toThrow(/outside.*application/i);
  await expect(stat(inside)).rejects.toThrow();
});
