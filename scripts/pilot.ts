import { mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
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
import { commitment } from "../src/lib/domain/receipt";
import { armMeasurementDraft, createArmTemplates, executePilotAgent, preparePilotArms, sha256 } from "../src/lib/evaluation/pilot-arms";
import type { Fetcher } from "../src/lib/integrations/http";

const usage = `Usage:
  npm run pilot -- init <new-private-directory>
  npm run pilot -- freeze <pilot.json> <new-session.json>
  npm run pilot -- check <session.json> [trusted-frozen-commitment]
  npm run pilot -- record <session.json> <measurement.json> <new-session.json>
  npm run pilot -- export <session.json> <new-private-report-directory> [trusted-frozen-commitment]
  npm run pilot -- context <session.json> <case-id> <run-config.json> <new-private-context-directory>
  npm run pilot -- rules <session.json> <case-id> <run-config.json> <new-private-run-directory>
  npm run pilot -- run-arms <session.json> <case-id> <run-config.json> <new-private-run-directory> --allow-external-model --allow-paid-call

Capture/rules commands make no network calls. run-arms requires separate active
external-processing consent, both opt-ins, and the selected provider's private key
(COUNTERSIGN_PILOT_OPENAI_API_KEY or COUNTERSIGN_PILOT_DEEPSEEK_API_KEY).
It reserves one bounded model attempt; uncertain runs are never retried automatically.
No command sends notices or payments. All outputs remain private.
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

Optional local model comparison: complete arm-input-template.json and place its
strict verification/originals envelope in the case's snapshot.content BEFORE freeze.
Complete run-config-template.json with exact asset mapping and separate case-bound
provider/model processing consent. Run rules offline first, then run-arms only when the
owner approves an actual paid call. Read /docs/evaluation for command flags, durable
reservations, unknown outcomes and measurement drafts. No model call is made by init.
`;

async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 20_000_000)
    throw new Error("Pilot input must be a regular JSON file no larger than 20 MB");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 20_000_000)
    throw new Error("Pilot input exceeds 20 MB");
  try { return JSON.parse(raw); }
  catch { throw new Error("Pilot input is not valid JSON; inspect the private file locally."); }
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
  let gitAncestor = destination;
  for (;;) {
    try {
      await stat(join(gitAncestor, ".git"));
      throw new Error("Private pilot inputs and outputs must stay outside Git checkouts");
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || !["ENOENT", "ENOTDIR"].includes(String(error.code))) throw error;
    }
    const parent = dirname(gitAncestor);
    if (parent === gitAncestor) break;
    gitAncestor = parent;
  }
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

type CodeProvenance = { head: string | null; dirty: boolean | null; criticalFiles: Record<string, string | null> };
export type PilotCliDependencies = {
  apiKey?: string; fetcher?: Fetcher; clock?: () => string;
  reservationDirectory?: string; readCodeProvenance?: () => Promise<CodeProvenance>;
};
async function syncDirectory(path: string) {
  const directory = await open(path, "r");
  try { await directory.sync(); }
  catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || !["EINVAL", "ENOTSUP"].includes(String(error.code))) throw error;
  } finally { await directory.close(); }
}
async function writeDurable(path: string, value: unknown) {
  await privateOutput(path);
  const raw = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(raw) > 20_000_000) throw new Error("Private run artifact exceeds 20 MB");
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(dirname(path));
}
async function runtimeCode(): Promise<CodeProvenance> {
  const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
  const criticalFiles: CodeProvenance["criticalFiles"] = {};
  for (const path of ["scripts/pilot.ts", "src/lib/evaluation/pilot-arms.ts", "src/lib/domain/verifier.ts", "src/lib/domain/money.ts", "src/lib/domain/types.ts", "src/lib/domain/pilot.ts", "src/lib/domain/receipt.ts", "src/lib/integrations/agent.ts", "src/lib/integrations/http.ts", "src/lib/integrations/model-provider.ts"])
    criticalFiles[path] = sha256(await readFile(join(root, path), "utf8"));
  const exec = promisify(execFile);
  try {
    const { stdout: top } = await exec("git", ["-C", root, "rev-parse", "--show-toplevel"]);
    if (await realpath(top.trim()) !== root) throw new Error("Application Git root unavailable");
    const { stdout: head } = await exec("git", ["-C", root, "rev-parse", "HEAD"]);
    const { stdout: dirty } = await exec("git", ["-C", root, "status", "--porcelain"]);
    return { head: head.trim(), dirty: dirty.trim().length > 0, criticalFiles };
  } catch { return { head: null, dirty: null, criticalFiles }; }
}

/** Exported for filesystem integration tests; the executable wrapper supplies the real current time. */
export async function runPilotCli(args: string[], now = new Date().toISOString(), dependencies: PilotCliDependencies = {}): Promise<string> {
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
    const arms = createArmTemplates();
    await writeNew(join(directory, "arm-input-template.json"), arms.input);
    await writeNew(join(directory, "run-config-template.json"), arms.config);
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
  if (command === "context" || command === "rules" || command === "run-arms") {
    const withModel = command === "run-arms";
    if (paths.length < 4) throw new Error(usage);
    const [sessionFile, caseId, configFile, output, ...flags] = paths;
    if (withModel && (flags.length !== 2 || new Set(flags).size !== 2 ||
        !flags.includes("--allow-external-model") || !flags.includes("--allow-paid-call")))
      throw new Error("Both external-processing and paid-call opt-ins are required");
    if (!withModel && flags.length) throw new Error(usage);
    await privateOutput(sessionFile);
    await privateOutput(configFile);
    const prepared = preparePilotArms(await readJson(sessionFile), caseId, await readJson(configFile), now, withModel);
    const codeReader = dependencies.readCodeProvenance ?? runtimeCode;
    const code = await codeReader();
    if (prepared.config.codeCommit && code.head && prepared.config.codeCommit !== code.head)
      throw new Error("Declared code commit does not match runtime Git HEAD");
    const keyName = prepared.config.provider === "deepseek" ? "COUNTERSIGN_PILOT_DEEPSEEK_API_KEY" : "COUNTERSIGN_PILOT_OPENAI_API_KEY";
    const apiKey = dependencies.apiKey ?? process.env[keyName] ?? "";
    if (withModel && !apiKey.trim()) throw new Error(`${keyName} must be configured outside artifacts`);
    if (withModel && JSON.stringify(prepared).includes(apiKey)) throw new Error("Credential appears in private inputs; redact it before evaluation");
    const directory = resolve(output);
    await privateOutput(directory);
    await mkdir(directory, { mode: 0o700 });
    await syncDirectory(dirname(directory));
    if (command === "context") {
      await writeDurable(join(directory, "context.json"), { schemaVersion: 1, caseId,
        frozenCommitment: prepared.frozenCommitment, inputCommitment: prepared.inputCommitment,
        asOf: prepared.snapshot.verification.now, snapshot: prepared.snapshot, privateByDefault: true });
      await writeDurable(join(directory, "measurement-prior-workflow.json"), {
        ...createPilotTemplates().measurement, caseId, inputCommitment: prepared.inputCommitment,
        arm: "prior-workflow", appliedToWorkflow: false, dueOutcome: "not-observed",
      });
      return encoded({ directory, caseId, privateByDefault: true, decisions: 0,
        next: "Give only context.json to the prior-workflow reviewer. Record actual operator decision, time and cost without exposing labels or later arm answers." });
    }
    if (withModel) {
      // Fixed host-local registry survives changes to session/output directories.
      const registry = dependencies.reservationDirectory ?? join(homedir(), ".local", "state", "countersign", "pilot-model-runs");
      await privateOutput(registry);
      await mkdir(registry, { mode: 0o700, recursive: true });
      await syncDirectory(dirname(registry));
      const key = commitment({ frozenCommitment: prepared.frozenCommitment, caseId, runId: prepared.runId }).slice(2);
      await writeDurable(join(registry, key + ".json"), {
        schemaVersion: 1, state: "reserved-outcome-unknown", runId: prepared.runId, caseId,
        provider: prepared.config.provider, model: prepared.config.model,
        frozenCommitment: prepared.frozenCommitment, inputCommitment: prepared.inputCommitment,
        evidenceCommitment: prepared.evidenceCommitment, outputDirectory: directory, reservedAt: now, maxCalls: 1,
      });
    }
    await writeDurable(join(directory, "input.json"), prepared);
    await writeDurable(join(directory, "rules.json"), prepared.rules);
    const clock = dependencies.clock ?? (() => new Date().toISOString());
    const revalidate = async () => {
      const freshCode = await codeReader();
      const fresh = preparePilotArms(await readJson(sessionFile), caseId, await readJson(configFile), clock(), true);
      if (fresh.evidenceCommitment !== prepared.evidenceCommitment || commitment(fresh.config) !== commitment(prepared.config) ||
          commitment(freshCode) !== commitment(code))
        throw new Error("Consent, frozen binding or runtime source changed");
    };
    const attempted = withModel ? await executePilotAgent(prepared, {
      apiKey, fetcher: dependencies.fetcher ?? fetch, clock, revalidate,
      saveRequest: (value) => writeDurable(join(directory, "request.json"), value),
      saveResponse: (value) => writeDurable(join(directory, "response.json"), value),
    }) : { status: "rules-only" as const, agent: null, providerResponse: null, dispatchedAt: null, finishedAt: clock(), failure: null };
    const questions = attempted.agent?.proposal.missing.map((text, questionIndex) => ({
      runId: prepared.runId, caseId, questionIndex, text, inputCommitment: prepared.inputCommitment,
      evidenceCommitment: prepared.evidenceCommitment, sourceIds: attempted.agent!.proposal.sourceIds,
      obligationId: prepared.snapshot.verification.invoice.obligationId, engagementVersion: prepared.policy.engagementVersion,
      status: "unanswered",
    })) ?? [];
    const result = {
      schemaVersion: 1, runId: prepared.runId, caseId, inputCommitment: prepared.inputCommitment,
      selectedProvider: prepared.config.provider, selectedModel: prepared.config.model,
      frozenCommitment: prepared.frozenCommitment, evidenceCommitment: prepared.evidenceCommitment,
      declaredCodeCommit: prepared.config.codeCommit, runtimeCode: code,
      declaredCommitMatchesHead: prepared.config.codeCommit && code.head ? prepared.config.codeCommit === code.head : null,
      rulesVersionDeclaration: prepared.config.rulesVersion, policy: prepared.policy, contractualBasis: prepared.contractualBasis,
      rules: prepared.rules, rulesQuestions: prepared.rulesQuestions, ...attempted, questions, authority: "proposal-only", privateByDefault: true,
      operatingCost: null, humanMinutes: null, paymentOutcome: "not-observed",
      latencyMilliseconds: attempted.dispatchedAt && Date.parse(attempted.finishedAt) >= Date.parse(attempted.dispatchedAt)
        ? Date.parse(attempted.finishedAt) - Date.parse(attempted.dispatchedAt) : null,
      comparison: { rulesAction: prepared.rules.action, agentAction: attempted.agent?.proposal.action ?? null,
        actionChanged: attempted.agent ? prepared.rules.action !== attempted.agent.proposal.action : null },
      limitations: ["Source authenticity and consent authority are operator declarations; hashes establish consistency only.",
        "Model questions are unanswered proposals, never acceptance or independent truth.",
        "Latency is not human work. Tokens are not monetary cost. Unknown runs cannot fill a rules-agent measurement.",
        "Same action does not prove equal usefulness; measure actionable missing conditions, citations and actual operator effort.",
        "Offline decisions never authorize payment. Publication requires separate consent and review."],
    };
    await writeDurable(join(directory, "result.json"), result);
    await writeDurable(join(directory, "measurement-rules.json"), armMeasurementDraft(prepared, "rules", prepared.rules.action));
    await writeDurable(join(directory, "measurement-rules-agent.json"), armMeasurementDraft(prepared, "rules-agent", attempted.agent?.proposal.action ?? null));
    await writeDurable(join(directory, "answer-template.json"), { runId: prepared.runId, caseId, inputCommitment: prepared.inputCommitment,
      evidenceCommitment: prepared.evidenceCommitment, answers: questions.map((question) => ({
        questionIndex: question.questionIndex, answerEvidenceId: null, approverId: null, obligationId: question.obligationId,
        engagementVersion: question.engagementVersion, kind: null, statement: null, observedAt: null,
      })) });
    return encoded({ directory, runId: prepared.runId, caseId, status: attempted.status, privateByDefault: true,
      operatingCost: null, humanMinutes: null, questions: questions.length, next: "Review private result and unresolved questions. Measure operator effort/cost separately; complete all three arms before pilot export." });
  }
  throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPilotCli(process.argv.slice(2)).then((output) => console.log(output)).catch((error: unknown) => {
    if (error instanceof z.ZodError)
      console.error("Pilot data failed schema validation; inspect the private inputs against /docs/evaluation.");
    else console.error("Pilot command failed. Run pilot --help and inspect private inputs, consent, bindings and new output paths locally.");
    process.exitCode = 1;
  });
}
