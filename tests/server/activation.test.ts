import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  inspectActivation,
  runActivationChecks,
  inspectRestoredIdentities,
} from "../../src/lib/server/activation";
import type { DeploymentManifest } from "../../src/lib/integrations/manifest";
import type { Database } from "../../src/lib/server/db";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll } from "vitest";
import { discoverMigrationRequirements, verifyDatabaseSchema } from "../../src/lib/server/activation";
import { activationCheckPassed, parseActivationArguments } from "../../scripts/activation-cli";

const now = new Date("2026-10-06T00:00:00.000Z");
const key = `0x${"01".repeat(32)}` as const;
const executor = "0x1111111111111111111111111111111111111111";
const manifest: DeploymentManifest = {
  schemaVersion: 1,
  organizationId: "11111111-1111-4111-8111-111111111111",
  chainId: 5042002,
  safe: "0x2222222222222222222222222222222222222222",
  module: "0x3333333333333333333333333333333333333333",
  token: "0x3600000000000000000000000000000000000000",
  tokenDecimals: 6,
  moduleCodeHash: `0x${"ab".repeat(32)}`,
  circleWallet: executor,
  circleChain: "ARC-TESTNET",
  verifier: privateKeyToAccount(key).address,
  verifiedAt: "2026-10-05T00:00:00Z",
  expiresAt: "2026-10-07T00:00:00Z",
  compatibility: {
    cliVersion: "1.1.4",
    moduleExecutionTransaction: `0x${"01".repeat(32)}`,
    revocationTransaction: `0x${"02".repeat(32)}`,
    renewalEvidenceHash: `0x${"03".repeat(32)}`,
  },
  securityReview: {
    reviewer: "Independent test fixture reviewer",
    reportHash: `0x${"04".repeat(32)}`,
    approvedAt: "2026-10-05T00:00:00Z",
  },
  testnet: true,
};
const env = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://owner:super-secret@db.example/countersign?sslmode=require",
  DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString("base64"),
  APP_ORIGIN: "https://countersign.example",
  EXECUTION_ENABLED: "false",
  SOURCE_RPC_URL: "https://rpc.example/private-rpc-token",
  SOURCE_CHAIN_ID: "5042002",
  VERIFIER_PRIVATE_KEY: key,
  CRON_SECRET: "worker-secret-".repeat(4),
};
const check = (report: ReturnType<typeof inspectActivation>, id: string) =>
  report.checks.find((item) => item.id === id)!;

describe("secret-redacted activation inspection", () => {
  it("reports missing persistence and preserves the disabled executor", () => {
    const report = inspectActivation({ env: {}, now });
    expect(report.workspaceConfigured).toBe(false);
    expect(report.executionConfigured).toBe(false);
    expect(report.financialActivationVerified).toBe(false);
    expect(check(report, "database.configuration").status).toBe("missing");
    expect(check(report, "execution.switch").status).toBe("disabled");
    expect(report.checks.every((item) => item.status !== "verified")).toBe(true);
  });

  it("separates structurally configured values from provider verification", () => {
    const report = inspectActivation({ env, manifest, now, profile: "verifier" });
    expect(report.workspaceConfigured).toBe(true);
    expect(check(report, "manifest.configuration").status).toBe("configured");
    expect(check(report, "verifier.binding").status).toBe("configured");
    expect(report.financialActivationVerified).toBe(false);
    const output = JSON.stringify(report);
    for (const secret of [env.DATABASE_URL, key, env.DOCUMENT_ENCRYPTION_KEY, env.CRON_SECRET, env.SOURCE_RPC_URL]) {
      expect(output).not.toContain(secret);
    }
  });

  it("rejects insecure origins and permissively decoded malformed keys", () => {
    const report = inspectActivation({
      env: { ...env, APP_ORIGIN: "http://countersign.example/path", DOCUMENT_ENCRYPTION_KEY: `${env.DOCUMENT_ENCRYPTION_KEY}!!!` }, now,
    });
    expect(check(report, "auth.origin").status).toBe("invalid");
    expect(check(report, "documents.key").status).toBe("invalid");
    expect(report.workspaceConfigured).toBe(false);
  });

  it("refuses worker verifier-key custody and shared executor identities", () => {
    const worker = inspectActivation({ env, manifest, now, profile: "worker" });
    expect(check(worker, "credentials.custody").status).toBe("invalid");
    const shared = inspectActivation({ env, manifest: { ...manifest, circleWallet: manifest.verifier }, now, profile: "verifier" });
    expect(check(shared, "executor.separation").status).toBe("invalid");
    expect(shared.executionConfigured).toBe(false);
  });

  it("does not require document or web-origin secrets on the financial worker", () => {
    const report = inspectActivation({ env: { DATABASE_URL: env.DATABASE_URL, SOURCE_RPC_URL: env.SOURCE_RPC_URL, CIRCLE_CLI_HOME: "/fixture/profile", EXECUTION_ENABLED: "true" }, manifest, now, profile: "worker" });
    expect(report.workspaceConfigured).toBe(true);
    expect(report.executionConfigured).toBe(true);
    expect(check(report, "documents.key").requiredFor).toBe("optional");
  });

  it.each([
    { chainId: 1, circleChain: "ETH", testnet: false },
    { testnet: false },
    { token: "0x4444444444444444444444444444444444444444" },
    { tokenDecimals: 18 },
    { circleChain: "ETH-SEPOLIA" },
  ])("never reports unsupported financial networks configured: %j", (override) => {
    const report = inspectActivation({
      env: { DATABASE_URL: env.DATABASE_URL, SOURCE_RPC_URL: env.SOURCE_RPC_URL, CIRCLE_CLI_HOME: "/fixture/profile", EXECUTION_ENABLED: "true" },
      manifest: { ...manifest, ...override }, now, profile: "worker",
    });
    expect(report.executionConfigured).toBe(false);
    expect(report.mainnetEnabled).toBe(false);
    expect(check(report, "execution.network").status).toBe("invalid");
  });

  it("reports the fixed testnet boundary even without configuration", () => {
    const missing = inspectActivation({ env: {}, now });
    expect(missing.mainnetEnabled).toBe(false);
    expect(check(missing, "execution.network").status).toBe("missing");
    const configured = inspectActivation({ env, manifest, now });
    expect(check(configured, "execution.network").status).toBe("configured");
    expect(configured.mainnetEnabled).toBe(false);
  });

  it("rejects stale, conflicting and future deployment evidence", () => {
    for (const candidate of [
      { ...manifest, expiresAt: "2026-10-05T00:00:00Z" },
      { ...manifest, verifiedAt: "2026-10-07T00:00:00Z" },
      { ...manifest, securityReview: { ...manifest.securityReview, approvedAt: "2026-10-07T00:00:00Z" } },
    ]) {
      expect(check(inspectActivation({ env, manifest: candidate, now }), "manifest.configuration").status).toBe("invalid");
    }
    const mismatch = inspectActivation({ env: { ...env, SAFE_ADDRESS: executor }, manifest, now });
    expect(check(mismatch, "manifest.binding").status).toBe("invalid");
  });

  it("does not certify another workspace's manifest through a tenant-scoped API", () => {
    const report = inspectActivation({ env: { ...env, EXECUTION_ENABLED: "true" }, manifest, now, profile: "verifier", organizationId: "99999999-9999-4999-8999-999999999999" });
    expect(check(report, "manifest.binding").status).toBe("invalid");
    expect(report.executionConfigured).toBe(false);
  });

  it("does not treat release flags, notification secrets or model keys as live proof", () => {
    const report = inspectActivation({ env: { ...env, EXECUTION_ENABLED: "true", CIRCLE_COMPATIBILITY_VERIFIED: "true", EXECUTION_SECURITY_REVIEW_APPROVED: "true", MODEL_API_KEY: "model-secret", MODEL_NAME: "model-fixture", NOTIFICATIONS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "bot-secret", TELEGRAM_CHAT_ID: "chat-secret" }, now });
    expect(report.executionConfigured).toBe(false);
    expect(check(report, "integration.model").status).toBe("configured");
    expect(check(report, "integration.notifications").status).toBe("configured");
    expect(JSON.stringify(report)).not.toMatch(/model-secret|bot-secret|chat-secret/);
  });
});

describe("explicit read-only probes", () => {
  it("performs no network, database or filesystem probes by default", async () => {
    const fetcher = vi.fn();
    const database = { query: vi.fn() } as unknown as Database;
    const report = await runActivationChecks({ env, now, fetcher, database });
    expect(report.probesRequested).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it("reports an unreadable manifest file as invalid without a network probe", async () => {
    const report = await runActivationChecks({ env: { ...env, EXECUTION_MANIFEST_PATH: "/missing/countersign-test-manifest.json" }, now });
    expect(check(report, "manifest.configuration").status).toBe("invalid");
    expect(report.executionConfigured).toBe(false);
  });

  it("blocks an incomplete deployed migration registry using a read-only transaction", async () => {
    const sql: string[] = [];
    const database = {
      query: async (query: string) => {
        sql.push(query);
        if (query.includes("to_regclass")) return { rows: [{ migration_table: "schema_migrations" }] };
        if (query.includes("SELECT version")) return { rows: [{ version: "001_foundation" }] };
        if (query.includes("information_schema.columns")) return { rows: [] };
        return { rows: [] };
      },
    } as unknown as Database;
    const report = await runActivationChecks({ env: { ...env, SOURCE_RPC_URL: "" }, now, probe: true, database,
      migrationRequirements: { versions: ["001_foundation", "002_security_controls"], tables: ["organizations"], columns: {} },
      fetcher: async () => new Response("{}", { status: 503 }),
    });
    expect(check(report, "database.schema").status).toBe("failed");
    expect(check(report, "database.schema").detail).toContain("002_security_controls");
    expect(sql[0]).toBe("BEGIN READ ONLY");
    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql.join(" ")).not.toMatch(/INSERT|UPDATE|DELETE|ALTER|CREATE/);
  });

  it("redacts arbitrary provider/database exception messages and never sends Telegram notices", async () => {
    const fetched: string[] = [];
    const report = await runActivationChecks({ env: { ...env, MODEL_API_KEY: "model-secret", MODEL_NAME: "fixture", TELEGRAM_BOT_TOKEN: "bot-secret", TELEGRAM_CHAT_ID: "chat-secret", NOTIFICATIONS_ENABLED: "true" }, now, probe: true,
      database: { query: async () => { throw new Error(env.DATABASE_URL); } } as unknown as Database,
      fetcher: async (url, options) => {
        fetched.push(String(url));
        expect(options?.method ?? "GET").toBe("GET");
        expect(options?.redirect).toBe("error");
        throw new Error(`model-secret bot-secret ${key}`);
      },
    });
    expect(JSON.stringify(report)).not.toMatch(/model-secret|bot-secret|super-secret/);
    expect(fetched.some((url) => url.includes("sendMessage"))).toBe(false);
    expect(fetched.some((url) => url.endsWith("getMe"))).toBe(true);
    expect(check(report, "database.schema").status).toBe("failed");
  });

  it("keeps a malformed bot credential from changing the read-only endpoint", async () => {
    const paths: string[] = [];
    await runActivationChecks({ env: { APP_ORIGIN: env.APP_ORIGIN, NOTIFICATIONS_ENABLED: "true", TELEGRAM_BOT_TOKEN: "123/sendMessage?chat_id=fixture&text=fixture#", TELEGRAM_CHAT_ID: "fixture" }, now, probe: true,
      fetcher: async (url) => { paths.push(new URL(String(url)).pathname); return new Response(JSON.stringify({ ok: true, result: { is_bot: true } })); },
    });
    expect(paths).toHaveLength(1);
    expect(paths[0].endsWith("/getMe")).toBe(true);
  });
});

describe("restore identity verification", () => {
  it("detects changed payment identity and reports only commitments and counts", async () => {
    const row = { id: "payment-private", organization_id: "tenant-private", idempotency_key: "original-operation-private", source_tx: "hash-private" };
    const database = { query: async (sql: string) => ({ rows: sql.includes("FROM payment_intents") ? [row] : [] }) } as unknown as Database;
    const original = await inspectRestoredIdentities(database);
    expect(original.tables.payment_intents.count).toBe(1);
    expect(JSON.stringify(original)).not.toMatch(/payment-private|tenant-private|original-operation-private|hash-private/);
    const restored = await inspectRestoredIdentities({ query: async (sql: string) => ({ rows: sql.includes("FROM payment_intents") ? [{ ...row, idempotency_key: "changed" }] : [] }) } as unknown as Database, original);
    expect(restored.matchesBaseline).toBe(false);
    expect(restored.mismatchedTables).toContain("payment_intents");
  });
});

describe("activation command boundary", () => {
  it("requires an explicit probe flag and rejects unrecognized options", () => {
    expect(parseActivationArguments([]).probe).toBe(false);
    expect(parseActivationArguments(["--json", "--probe", "--profile=worker"]).probe).toBe(true);
    expect(() => parseActivationArguments(["--enable-execution"])).toThrow();
    expect(() => parseActivationArguments(["--profile=typo"])).toThrow();
    expect(activationCheckPassed(inspectActivation({ env, now }), "workspace")).toBe(true);
    expect(activationCheckPassed(inspectActivation({ env, now }), "execution")).toBe(false);
  });
});

describe("actual PostgreSQL migration and restore readbacks", () => {
  let pglite: PGlite;
  let database: Database;
  beforeAll(async () => {
    pglite = new PGlite();
    const requirements = await discoverMigrationRequirements();
    for (const version of requirements.versions) await pglite.exec(await readFile(`migrations/${version}.sql`, "utf8"));
    database = pglite as unknown as Database;
  });
  afterAll(async () => { await pglite.close(); });

  it("verifies the exact shipped migration list and fails on an unknown revision", async () => {
    const requirements = await discoverMigrationRequirements();
    expect(requirements.versions).toContain("004_access_metadata");
    expect((await verifyDatabaseSchema(database, requirements)).status).toBe("verified");
    await pglite.exec("INSERT INTO schema_migrations(version) VALUES('999_other_revision')");
    expect((await verifyDatabaseSchema(database, requirements)).status).toBe("failed");
    await pglite.exec("DELETE FROM schema_migrations WHERE version='999_other_revision'");
  });

  it("does not trust migration labels when a required security column is missing", async () => {
    await pglite.exec("ALTER TABLE payment_intents DROP COLUMN invalidated_at");
    expect((await verifyDatabaseSchema(database, await discoverMigrationRequirements())).status).toBe("failed");
    await pglite.exec("ALTER TABLE payment_intents ADD COLUMN invalidated_at timestamptz");
  });

  it("fingerprints actual encrypted bytes without outputting their content", async () => {
    await pglite.exec("INSERT INTO organizations(id,name) VALUES('11111111-1111-4111-8111-111111111111','Restore fixture'); INSERT INTO documents(id,organization_id,filename,mime,byte_length,ciphertext,iv,tag,commitment,created_by) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','private-fixture.pdf','application/pdf',3,decode('deadbeef','hex'),decode('0102','hex'),decode('0304','hex'),'private-source-commitment','private-actor')");
    const baseline = await inspectRestoredIdentities(database);
    expect(baseline.tables.documents.count).toBe(1);
    expect(JSON.stringify(baseline)).not.toMatch(/deadbeef|private-fixture|private-source|private-actor/);
    expect((await inspectRestoredIdentities(database, baseline)).matchesBaseline).toBe(true);
    await pglite.exec("UPDATE documents SET ciphertext=decode('cafebabe','hex')");
    expect((await inspectRestoredIdentities(database, baseline)).mismatchedTables).toEqual(["documents"]);
  });
});


it("checks DeepSeek model access using only its fixed read-only list endpoint", async () => {
  const requests: string[] = [];
  const report = await runActivationChecks({ env: { MODEL_PROVIDER: "deepseek", MODEL_NAME: "deepseek-flash", DEEPSEEK_API_KEY: "deepseek-private-key" }, now, probe: true,
    fetcher: async (url, init) => {
      requests.push(String(url));
      expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("error");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer deepseek-private-key" });
      return Response.json({ object: "list", data: [{ id: "deepseek-flash" }] });
    },
  });
  expect(requests).toEqual(["https://api.deepseek.com/models"]);
  expect(check(report, "integration.model").status).toBe("configured");
  expect(check(report, "model.access").status).toBe("verified");
  expect(JSON.stringify(report)).not.toContain("deepseek-private-key");
  expect(report.financialActivationVerified).toBe(false);
});

it("marks unsupported model providers invalid and makes no model request", async () => {
  const fetcher = vi.fn();
  const report = await runActivationChecks({ env: { MODEL_PROVIDER: "other", MODEL_NAME: "fixture", MODEL_API_KEY: "private-key" }, now, probe: true, fetcher });
  expect(check(report, "integration.model").status).toBe("invalid");
  expect(fetcher).not.toHaveBeenCalled();
});
