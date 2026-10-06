import {
  formatActivationReport,
  runActivationChecks,
  type ActivationProfile,
  type ActivationReport,
} from "../src/lib/server/activation";

export function parseActivationArguments(args: readonly string[]) {
  const options = { probe: false, json: false, strict: false, help: false, profile: "web" as ActivationProfile, scope: "workspace" as "workspace" | "execution" };
  for (const arg of args) {
    if (arg === "--probe") options.probe = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help") options.help = true;
    else if (["--profile=web", "--profile=worker", "--profile=verifier"].includes(arg)) options.profile = arg.slice(10) as ActivationProfile;
    else if (["--scope=workspace", "--scope=execution"].includes(arg)) options.scope = arg.slice(8) as "workspace" | "execution";
    else throw new Error("Unknown activation option. Use --help; no checks were performed.");
  }
  return options;
}

export function activationCheckPassed(report: ActivationReport, scope: "workspace" | "execution"): boolean {
  if (!report.workspaceConfigured || (report.probesRequested && !report.databaseVerified)) return false;
  if (scope === "execution" && (!report.executionConfigured || (report.probesRequested && !report.deploymentVerified))) return false;
  return !report.checks.some((check) => check.requiredFor === scope && ["missing", "invalid", "failed", "disabled"].includes(check.status));
}

export async function activationCli(args: readonly string[], strictByDefault = false): Promise<void> {
  try {
    const options = parseActivationArguments(args);
    if (options.help) {
      console.log("Usage: npm run doctor -- [--json] [--probe] [--strict] [--profile=web|worker|verifier] [--scope=workspace|execution]\nDefault: local checks only; no remote requests, signing or submission. --probe performs explicit read-only database/provider/chain readbacks. --strict exits 1 when the selected technical configuration checks fail. Financial activation always requires separate owner authorization.\nLoad private credentials with: node --env-file=.env.local --import tsx scripts/doctor.ts");
      return;
    }
    const report = await runActivationChecks(options);
    console.log(options.json ? JSON.stringify(report, null, 2) : formatActivationReport(report));
    if ((options.strict || strictByDefault) && !activationCheckPassed(report, options.scope)) process.exitCode = 1;
  } catch {
    console.error("Activation check could not run. Review arguments, private environment-file configuration and local manifest access. No secret values or exception messages are printed.");
    process.exitCode = 1;
  }
}
