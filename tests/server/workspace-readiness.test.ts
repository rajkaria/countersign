import { describe, it, expect, vi } from "vitest";
import {
  discoverMigrationRequirements,
  inspectActivation,
} from "../../src/lib/server/activation";
import { migrationRequirements } from "../../src/lib/server/migration-requirements";
import { probeWorkspaceDatabase } from "../../src/lib/server/workspace-readiness";
import type { Database } from "../../src/lib/server/db";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

describe("shipped workspace readiness", () => {
  it("bundles exactly the requirements of every shipped SQL migration", async () => {
    expect(migrationRequirements).toEqual(
      await discoverMigrationRequirements(),
    );
  });
  it("a reachable empty database stays unverified and rolls back the read-only probe", async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("to_regclass") ? [{ migration_table: null }] : [],
    }));
    const report = await probeWorkspaceDatabase(
      { query } as Database,
      inspectActivation({ env: {} }),
    );
    expect(report.databaseVerified).toBe(false);
    expect(report.financialActivationVerified).toBe(false);
    expect(report.checks.find((c) => c.id === "database.schema")?.status).toBe(
      "failed",
    );
    expect(query.mock.calls[0][0]).toBe("BEGIN READ ONLY");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("redacts database failures without certifying configured credentials", async () => {
    const db = {
      query: vi
        .fn()
        .mockRejectedValue(new Error("private-db-password private-host")),
    };
    const report = await probeWorkspaceDatabase(
      db,
      inspectActivation({ env: {} }),
    );
    expect(JSON.stringify(report)).not.toContain("private-db-password");
    expect(JSON.stringify(report)).not.toContain("private-host");
    expect(report.probesRequested).toBe(true);
    expect(report.databaseVerified).toBe(false);
    expect(report.deploymentVerified).toBe(false);
  });
  it("requires every shipped migration and security column, even when the database is reachable", async () => {
    const db = new PGlite();
    try {
      for (const version of migrationRequirements.versions)
        await db.exec(await readFile(`migrations/${version}.sql`, "utf8"));
      const baseline = inspectActivation({ env: {} });
      expect(
        (await probeWorkspaceDatabase(db, baseline)).databaseVerified,
      ).toBe(true);
      await db.exec("ALTER TABLE payment_intents DROP COLUMN invalidated_at");
      const broken = await probeWorkspaceDatabase(db, baseline);
      expect(broken.databaseVerified).toBe(false);
      expect(broken.financialActivationVerified).toBe(false);
      expect(
        broken.checks.find((c) => c.id === "database.schema")?.detail,
      ).toContain("security-control columns");
    } finally {
      await db.close();
    }
  });
});
