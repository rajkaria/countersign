import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { discoverMigrationRequirements } from "../../src/lib/server/activation";
import { operationsWorkerConfig, runOperationsWorkerOnce } from "../../scripts/operations-worker-loop";
import type { Database } from "../../src/lib/server/db";

const org = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
describe("independent operations worker boundary", () => {
  it("needs only a database and organization when notices are disabled", () => {
    const config = operationsWorkerConfig({ DATABASE_URL: "postgresql://fixture", OPERATIONS_ORGANIZATION_ID: org });
    expect(config.organizationId).toBe(org);
    expect(config.enabled).toBe(false);
  });
  it("refuses financial custody and incomplete enabled notification targets", () => {
    const base = { DATABASE_URL: "postgresql://fixture", OPERATIONS_ORGANIZATION_ID: org };
    expect(() => operationsWorkerConfig({ ...base, VERIFIER_PRIVATE_KEY: "private-key" })).toThrow();
    expect(() => operationsWorkerConfig({ ...base, CIRCLE_CLI_HOME: "/private/profile" })).toThrow();
    expect(() => operationsWorkerConfig({ ...base, EXECUTION_ENABLED: "true" })).toThrow();
    expect(() => operationsWorkerConfig({ ...base, NOTIFICATIONS_ENABLED: "true" })).toThrow();
  });
  it("does not lease or generate a notice when global notices are disabled", async () => {
    let queried = false;
    const result = await runOperationsWorkerOnce({ query: async () => { queried = true; throw new Error("must not query"); } } as unknown as Database, operationsWorkerConfig({ DATABASE_URL: "postgresql://fixture", OPERATIONS_ORGANIZATION_ID: org }));
    expect(result.status).toBe("disabled");
    expect(queried).toBe(false);
  });
});

describe("tenant and financial-job isolation with PostgreSQL", () => {
  let pglite: PGlite;
  beforeAll(async () => {
    pglite = new PGlite();
    for (const version of (await discoverMigrationRequirements()).versions) await pglite.exec(await readFile(`migrations/${version}.sql`, "utf8"));
    await pglite.query("INSERT INTO organizations(id,name) VALUES($1,'Primary fixture'),($2,'Other fixture')", [org, other]);
  });
  afterAll(async () => { await pglite.close(); });
  it("only consumes its tenant's operations notices and respects workspace opt-out", async () => {
    const jobs = [
      ["33333333-3333-4333-8333-333333333333", org, "operations.notify", "ours"],
      ["44444444-4444-4444-8444-444444444444", other, "operations.notify", "other"],
      ["55555555-5555-4555-8555-555555555555", org, "execute", "payment"],
    ];
    for (const [id, organizationId, kind, dedupe] of jobs) await pglite.query("INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,$3,$4,$5)", [id, organizationId, kind, { eventId: id, kind: "exception", summary: "Synthetic notice; no opt-in means no send." }, dedupe]);
    const result = await runOperationsWorkerOnce(pglite as unknown as Database, operationsWorkerConfig({ DATABASE_URL: "postgresql://fixture", OPERATIONS_ORGANIZATION_ID: org, NOTIFICATIONS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "never-used", TELEGRAM_CHAT_ID: "never-used", APP_ORIGIN: "https://fixture.example" }));
    expect(result.status).toBe("disabled");
    const { rows } = await pglite.query<{ id: string; completed: boolean; attempts: number }>("SELECT id,completed_at IS NOT NULL AS completed,attempts FROM outbox ORDER BY id");
    expect(rows).toEqual([
      { id: jobs[0][0], completed: true, attempts: 1 },
      { id: jobs[1][0], completed: false, attempts: 0 },
      { id: jobs[2][0], completed: false, attempts: 0 },
    ]);
    expect((await pglite.query("SELECT * FROM notification_deliveries")).rows).toEqual([]);
  });
});
