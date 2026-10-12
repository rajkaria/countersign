import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  createPilotTemplates,
  evaluatePilot,
  freezePilot,
  inspectPilot,
  recordPilotMeasurement,
  renderPilotCsv,
  renderPilotMarkdown,
} from "../src/lib/domain/pilot";

const usage = `Usage:
  npm run pilot -- init <new-private-directory>
  npm run pilot -- freeze <pilot.json> <new-session.json>
  npm run pilot -- check <session.json> [trusted-frozen-commitment]
  npm run pilot -- record <session.json> <measurement.json> <new-session.json>
  npm run pilot -- export <session.json> <new-private-report-directory> [trusted-frozen-commitment]

Files and directories must be new. This local tool makes no network requests,
model calls, notice sends, or payment attempts. All outputs remain private.
See /docs/evaluation for consent, capture, and interpretation instructions.`;

const walkthrough = `# Private Countersign pilot capture

This directory starts empty. Null means missing information, never a measured zero.
Keep it outside the application repository and outside publicly synced directories.

1. Fill pilot.json: your study/adjudicator IDs, one exact settlement asset and one
   operating-cost asset (IDs, labels, decimal precision), and active local-analysis
   consent evidence for every non-synthetic business.
2. Copy a completed case-template.json object into pilot.json's cases array for
   each held-out case. Use pseudonyms. snapshot contains asOf, evidenceIds, and
   content: the exact information available to all three arms at that time.
   Store money as canonical integer strings, not JSON floating-point numbers.
   Label and independently adjudicate cases before freeze. Later amendments
   belong in a new study. Do not put later information into earlier snapshots.
3. Run npm run pilot -- freeze /absolute/path/pilot.json /absolute/path/session-00.json
   from the Countersign application checkout. Save the printed frozen commitment
   with an independent reviewer before collecting results. Inputs are salted and
   retained privately in the frozen session, so each arm uses the identical input.
4. For prior-workflow, rules, and rules-agent, fill measurement-template.json with
   the case's inputCommitment from session-00.json. Record real operator IDs,
   start/end timestamps, explicitly measured pausedMilliseconds (0 only when no
   pause occurred), timing/decision evidence IDs, cost units and cost evidence,
   and observedAt. The kit does not run an agent or generate observations.
5. Set appliedToWorkflow=false for comparison arms, dueOutcome=not-observed,
   and settlement/repeatCycleEvidenceId/preventedEvidenceId=null. Only one arm
   per obligation may claim actual outcomes. Use unknown while an applied
   workflow's result is uncertain; never count source burns as destination delivery.
6. Run npm run pilot -- record session-00.json measurement.json session-01.json
   for each result, using a new revision path every time. Reuse the same frozen
   session rather than freezing again. Run npm run pilot -- check session-01.json
   to see missing arms. Three arms are required for every frozen case.
7. Keep session.consents current. Set revokedAt when permission is withdrawn;
   recording/export then rejects withdrawn business data. Stop use, delete or
   segregate retained data per the actual agreement, and re-confirm permissions
   before creating another study. Publication requires a separate grant and review.
8. Run npm run pilot -- export session-final.json /absolute/path/private-report
   optionally adding the independently trusted frozen commitment. Outputs include
   experiment.json for the existing evaluator, report.json, report.md, and
   measurements.csv. Raw snapshot content and salts are excluded from reports.

Exact JSON units are authoritative. CSV prefixes exact amounts and identities
with an apostrophe to protect them against spreadsheet coercion/formulas.
Unknown/not-due/unobserved results stay outside on-time denominators. Founder,
independent, testnet, mainnet, historical, and synthetic cohorts remain separate.
No report is published automatically. Evidence/consent truth requires human review.
`;

async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 20_000_000)
    throw new Error("Pilot input must be a regular JSON file no larger than 20 MB");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 20_000_000)
    throw new Error("Pilot input exceeds 20 MB");
  return JSON.parse(raw);
}
async function privateOutput(path: string) {
  const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
  let ancestor = resolve(path);
  const suffix: string[] = [];
  let destination: string;
  for (;;) {
    try {
      destination = join(await realpath(ancestor), ...suffix);
      break;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      suffix.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  const relation = relative(root, destination);
  if (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
    throw new Error("Private pilot outputs must stay outside the application source checkout");
}
async function writeNew(path: string, value: unknown) {
  await privateOutput(path);
  const raw = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(raw, "utf8") > 20_000_000)
    throw new Error("Pilot output exceeds the reusable 20 MB capture limit");
  await writeFile(path, raw, { flag: "wx", mode: 0o600 });
}
function encoded(value: unknown) {
  return JSON.stringify(value, null, 2);
}

/** Exported for filesystem integration tests; the executable wrapper supplies the real current time. */
export async function runPilotCli(args: string[], now = new Date().toISOString()): Promise<string> {
  const [command, ...paths] = args;
  if ((command === "help" || command === "--help" || command === undefined) && paths.length === 0)
    return usage;
  if (command === "init" && paths.length === 1) {
    const directory = resolve(paths[0]);
    const templates = createPilotTemplates();
    await privateOutput(directory);
    await mkdir(directory, { mode: 0o700 });
    await writeNew(join(directory, "pilot.json"), templates.study);
    await writeNew(join(directory, "case-template.json"), templates.case);
    await writeNew(join(directory, "measurement-template.json"), templates.measurement);
    await writeFile(join(directory, "README.md"), walkthrough, { flag: "wx", mode: 0o600 });
    return encoded({ directory, privateByDefault: true, cases: 0, measurements: 0, next: "Fill pilot.json and case templates; then freeze the held-out input before measurement." });
  }
  if (command === "freeze" && paths.length === 2) {
    const session = freezePilot(await readJson(paths[0]), now);
    await writeNew(paths[1], session);
    return encoded({ output: resolve(paths[1]), frozenCommitment: session.frozen.commitment, cases: session.frozen.data.cases.length, next: "Anchor this commitment independently before measurements. Keep frozen inputs private." });
  }
  if (command === "check" && (paths.length === 1 || paths.length === 2))
    return encoded(inspectPilot(await readJson(paths[0]), now, paths[1]));
  if (command === "record" && paths.length === 3) {
    const session = recordPilotMeasurement(await readJson(paths[0]), await readJson(paths[1]), now);
    await writeNew(paths[2], session);
    return encoded({ output: resolve(paths[2]), ...inspectPilot(session, now) });
  }
  if (command === "export" && (paths.length === 2 || paths.length === 3)) {
    // Complete validation happens before creating any output directory.
    const report = evaluatePilot(await readJson(paths[0]), now, paths[2]);
    const directory = resolve(paths[1]);
    await privateOutput(directory);
    await mkdir(directory, { mode: 0o700 });
    await writeNew(join(directory, "experiment.json"), report.experiment);
    await writeNew(join(directory, "report.json"), report);
    await writeFile(join(directory, "report.md"), renderPilotMarkdown(report), { flag: "wx", mode: 0o600 });
    await writeFile(join(directory, "measurements.csv"), renderPilotCsv(report), { flag: "wx", mode: 0o600 });
    return encoded({ directory, cases: report.evaluation.heldOutCaseCount, measurements: report.measurements.length, privateByDefault: true, publicationConsentComplete: report.publicationConsentComplete, next: "Review evidence truth, consent scope, and redaction before sharing. No publication is performed." });
  }
  throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPilotCli(process.argv.slice(2)).then((output) => console.log(output)).catch((error: unknown) => {
    if (error instanceof z.ZodError)
      console.error(error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("\n"));
    else console.error(error instanceof Error ? error.message : "Pilot capture failed");
    process.exitCode = 1;
  });
}
