import {
  inspectActivation,
  verifyDatabaseSchema,
  type ActivationReport,
} from "./activation";
import { migrationRequirements } from "./migration-requirements";
import type { Database } from "./db";

/** A dedicated connection is required; only read-only SQL is executed. No provider probes. */
export async function probeWorkspaceDatabase(
  db: Database,
  report: ActivationReport,
): Promise<ActivationReport> {
  const result = {
    ...report,
    probesRequested: true,
    checks: [...report.checks],
  };
  try {
    const schema = await verifyDatabaseSchema(db, migrationRequirements);
    result.databaseVerified = schema.status === "verified";
    result.checks.push({
      id: "database.schema",
      status: schema.status,
      requiredFor: "workspace",
      detail: schema.detail,
      action:
        "Apply this release's migrations to the dedicated database, then repeat the check. Readback does not establish tenant isolation, restore or document-key recovery.",
    });
  } catch {
    result.databaseVerified = false;
    result.checks.push({
      id: "database.schema",
      status: "failed",
      requiredFor: "workspace",
      detail:
        "Database readback failed. Inspect connection, TLS and permissions privately; credentials and database errors are redacted.",
    });
  }
  return result;
}

export const workspaceConfiguration = () =>
  inspectActivation({ profile: "web" });
