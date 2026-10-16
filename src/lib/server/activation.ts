import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import {
  deploymentManifestSchema,
  verifyDeploymentManifest,
  type DeploymentManifest,
} from "../integrations/manifest";
import {
  destinationRelayConfigSchema,
  type DestinationRelayConfig,
} from "../integrations/relay";
import { boundedJson, type Fetcher } from "../integrations/http";
import { assertTestnetExecutionNetwork } from "../integrations/execution-network";
import { readModelConfiguration, type ModelConfiguration } from "../integrations/model-provider";
import type { Database } from "./db";

export type ActivationProfile = "web" | "worker" | "verifier";
export type ActivationStatus = "missing" | "invalid" | "disabled" | "configured" | "verified" | "failed" | "owner_action";
export type ActivationCheck = {
  id: string;
  status: ActivationStatus;
  requiredFor: "workspace" | "execution" | "optional" | "operations";
  detail: string;
  action?: string;
};
export type ActivationReport = {
  schemaVersion: 1;
  checkedAt: string;
  profile: ActivationProfile;
  probesRequested: boolean;
  workspaceConfigured: boolean;
  executionConfigured: boolean;
  mainnetEnabled: false;
  databaseVerified: boolean;
  deploymentVerified: boolean;
  financialActivationVerified: false;
  checks: ActivationCheck[];
  limitations: string[];
};
type Environment = Record<string, string | undefined>;
type InspectionOptions = {
  env?: Environment;
  now?: Date;
  profile?: ActivationProfile;
  organizationId?: string;
  manifest?: unknown;
  relay?: unknown;
};
export type MigrationRequirements = {
  versions: string[];
  tables: string[];
  columns: Record<string, string[]>;
};
type ProbeOptions = InspectionOptions & {
  probe?: boolean;
  database?: Database;
  fetcher?: Fetcher;
  migrationDirectory?: string;
  migrationRequirements?: MigrationRequirements;
};
const configured = (value: string | undefined) => Boolean(value?.trim());
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const localHost = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
function validOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && localHost(url.hostname)));
  } catch { return false; }
}
function validHttp(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && localHost(url.hostname));
  } catch { return false; }
}
function validDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1);
  } catch { return false; }
}
function validDocumentKey(value: string | undefined): boolean {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value;
}
function inlineJson(value: string | undefined): unknown {
  if (!value) return undefined;
  if (value.length > 64_000) return null;
  try { return JSON.parse(value); } catch { return null; }
}
function currentManifest(value: unknown, now: Date): DeploymentManifest | undefined {
  const parsed = deploymentManifestSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const m = parsed.data;
  return Date.parse(m.expiresAt) > now.getTime() && Date.parse(m.verifiedAt) <= now.getTime() && Date.parse(m.securityReview.approvedAt) <= now.getTime() && Date.parse(m.expiresAt) > Date.parse(m.verifiedAt) ? m : undefined;
}
function currentRelay(value: unknown, now: Date): DestinationRelayConfig | undefined {
  const parsed = destinationRelayConfigSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const c = parsed.data;
  return Date.parse(c.review.expiresAt) > now.getTime() && Date.parse(c.review.verifiedAt) <= now.getTime() && Date.parse(c.review.expiresAt) > Date.parse(c.review.verifiedAt) ? c : undefined;
}

/** Local configuration inspection only. All output strings are authored here; raw env, remote bodies and exception messages never enter the report. */
export function inspectActivation(options: InspectionOptions = {}): ActivationReport {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const profile = options.profile ?? "web";
  const checks: ActivationCheck[] = [];
  const add = (id: string, status: ActivationStatus, requiredFor: ActivationCheck["requiredFor"], detail: string, action?: string) => checks.push({ id, status, requiredFor, detail, ...(action ? { action } : {}) });
  const db = validDatabase(env.DATABASE_URL);
  add("database.configuration", !configured(env.DATABASE_URL) ? "missing" : db ? "configured" : "invalid", "workspace", "Dedicated PostgreSQL connection configuration; no connection has been attempted.", "Provision a dedicated database and set DATABASE_URL through secret management.");
  if (db) {
    const url = new URL(env.DATABASE_URL!);
    const mode = url.searchParams.get("sslmode");
    add("database.transport", localHost(url.hostname) || ["require", "verify-ca", "verify-full"].includes(mode ?? "") ? "configured" : "owner_action", "operations", "Remote database transport needs reviewed TLS configuration; this check does not establish certificate validation.", "Configure provider-supported secure TLS and review runtime role privileges.");
  }
  const documentKey = validDocumentKey(env.DOCUMENT_ENCRYPTION_KEY);
  add("documents.key", !configured(env.DOCUMENT_ENCRYPTION_KEY) ? "missing" : documentKey ? "configured" : "invalid", profile === "worker" ? "optional" : "workspace", profile === "worker" ? "The financial worker does not require document-key custody; encrypted document access belongs in the web workspace." : "Document key must be a canonical base64 encoding of exactly 32 bytes.", "Generate and escrow the document key separately from the database backup.");
  const origin = validOrigin(env.APP_ORIGIN);
  add("auth.origin", !configured(env.APP_ORIGIN) ? "missing" : origin ? "configured" : "invalid", profile === "worker" ? "optional" : "workspace", "APP_ORIGIN must be an exact HTTPS origin, or an HTTP localhost origin for local development. The financial worker needs it only for enabled notice links.", "Set the canonical origin without a path, query, credentials or trailing slash.");
  add("worker.access", !configured(env.CRON_SECRET) ? "missing" : env.CRON_SECRET!.length >= 32 ? "configured" : "invalid", "operations", "A separate worker authentication secret requires at least 32 characters.", "Generate a random worker secret and place it only on authorized hosts.");
  const verifierPresent = configured(env.VERIFIER_PRIVATE_KEY);
  const circleProfilePresent = configured(env.CIRCLE_CLI_HOME);
  const custodyInvalid = (profile === "worker" && verifierPresent) || (profile !== "worker" && circleProfilePresent);
  add("credentials.custody", custodyInvalid ? "invalid" : "configured", "execution", profile === "worker" ? "The worker must not carry the isolated verifier signing key." : profile === "web" ? "The web host must not carry a Circle executor profile. The current authorization endpoint needs isolated verifier custody when enabled." : "This verifier process must remain separate from Circle executor profile custody.", "Use separate worker and verifier deployments; do not copy one shared secret file to every service.");
  if (profile === "worker") add("circle.profile", circleProfilePresent ? "configured" : "missing", "execution", "An explicit isolated CIRCLE_CLI_HOME is required for worker setup diagnostics. A configured path does not prove a provisioned agent wallet or accepted provider terms.", "Provision the Circle profile outside chat, mount it privately on this worker and set CIRCLE_CLI_HOME.");
  const rawManifest = options.manifest !== undefined ? options.manifest : inlineJson(env.EXECUTION_MANIFEST_JSON);
  const manifest = currentManifest(rawManifest, now);
  const manifestPathOnly = rawManifest === undefined && configured(env.EXECUTION_MANIFEST_PATH);
  add("manifest.configuration", manifest ? "configured" : manifestPathOnly ? "configured" : rawManifest !== undefined ? "invalid" : "missing", "execution", manifest ? "Manifest structure and validity window pass local checks. Claims still require chain readback and review." : manifestPathOnly ? "Manifest path is configured; the pure inspector has not read its contents." : "A current, schema-valid deployment evidence manifest is required; flags cannot replace it.", "Complete the manifest using genuine deployment, compatibility, recovery and review evidence.");
  let networkAllowed = false;
  if (manifest) {
    try { assertTestnetExecutionNetwork(manifest); networkAllowed = true; } catch { /* Only the authored network boundary is reported. */ }
  }
  add("execution.network", manifest ? networkAllowed ? "configured" : "invalid" : "missing", "execution", "New payments are restricted in code to direct Arc testnet canonical 6-decimal USDC (chain 5042002, ARC-TESTNET). Mainnet and new cross-chain submissions are disabled regardless of environment flags.", "Use a current testnet manifest with the canonical token. No environment setting enables mainnet in this release.");
  const bindings: [string, string][] = manifest ? [["SAFE_ADDRESS", manifest.safe], ["COUNTERSIGN_MODULE_ADDRESS", manifest.module], ["USDC_TOKEN_ADDRESS", manifest.token], ["CIRCLE_AGENT_WALLET", manifest.circleWallet], ["CIRCLE_CHAIN", manifest.circleChain], ["EXECUTION_ORGANIZATION_ID", manifest.organizationId], ["SOURCE_CHAIN_ID", String(manifest.chainId)]] : [];
  const bound = Boolean(manifest && (!options.organizationId || manifest.organizationId === options.organizationId) && bindings.every(([name, value]) => !configured(env[name]) || same(env[name]!, value)));
  add("manifest.binding", manifest ? bound ? "configured" : "invalid" : "missing", "execution", "Configured deployment identities must match the reviewed manifest; unset identities are supplied from that manifest by the worker.", "Resolve any source-chain, organization, token, Safe, module or Circle identity conflict.");
  const separated = Boolean(manifest && !same(manifest.circleWallet, manifest.verifier) && !same(manifest.safe, manifest.verifier) && !same(manifest.module, manifest.verifier));
  add("executor.separation", manifest ? separated ? "configured" : "invalid" : "missing", "execution", "Verifier, Circle executor, Safe and module must have distinct identities. Safe-owner independence still needs a deployment review.", "Provision independent executor, verifier and recovery-owner custody.");
  let verifierBound = false;
  if (manifest && /^0x[0-9a-fA-F]{64}$/.test(env.VERIFIER_PRIVATE_KEY ?? "")) {
    try { verifierBound = same(privateKeyToAccount(env.VERIFIER_PRIVATE_KEY as `0x${string}`).address, manifest.verifier); } catch { /* Invalid scalar, never emit the key or library error. */ }
  }
  add("verifier.binding", verifierPresent ? verifierBound ? "configured" : "invalid" : "missing", profile === "worker" ? "optional" : "execution", "The local verifier key must derive the manifest verifier address. No signature is produced.", profile === "worker" ? "Keep the verifier key off this host; configure it in the isolated authorization service." : "Set the isolated verifier key outside chat and match its public address to the reviewed manifest.");
  const rpc = env.SOURCE_RPC_URL || env.ARC_RPC_URL;
  const rpcConfigured = validHttp(rpc);
  add("source.rpc", !configured(rpc) ? "missing" : rpcConfigured ? "configured" : "invalid", "execution", "Source RPC is configuration only until the selected chain and exact deployment evidence are read back.", "Set a read-only HTTPS RPC for the manifest chain.");
  const enabled = env.EXECUTION_ENABLED === "true";
  add("execution.switch", enabled ? "configured" : "disabled", "execution", enabled ? "Execution is requested. This flag does not prove prerequisites or authorize funds." : "Execution remains disabled; Observe and Prepare can be enabled separately.", "Enable only after the separate owner activation procedure is complete.");
  let model: ModelConfiguration | null = null;
  let invalidModel = false;
  try { model = readModelConfiguration(env); } catch { invalidModel = true; }
  const modelPresent = [env.MODEL_PROVIDER, env.MODEL_API_KEY, env.MODEL_NAME, env.DEEPSEEK_API_KEY, env.OPENAI_API_KEY].some(configured);
  add("integration.model", model ? "configured" : invalidModel || modelPresent ? "invalid" : "disabled", "optional", "Extraction and agent proposals need a validated MODEL_PROVIDER (openai by default, or deepseek), MODEL_NAME and the selected provider's private key. Deterministic checks remain available without them.", "Configure MODEL_API_KEY or the matching OPENAI_API_KEY/DEEPSEEK_API_KEY and review provider data handling. DeepSeek Flash supports text/CSV/PNG/JPEG; its Responses API does not accept PDFs. The diagnostic never makes a paid model request.");
  const githubRepository = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(env.GITHUB_REPOSITORY ?? "") && ![".", ".."].includes((env.GITHUB_REPOSITORY ?? "").split("/")[1]);
  add("integration.github", configured(env.GITHUB_REPOSITORY) ? githubRepository ? "configured" : "invalid" : "disabled", "optional", "GitHub evidence is read-only activity, never acceptance. Public repositories need no token; private repositories need scoped access.", "Set GITHUB_REPOSITORY and a least-privilege GITHUB_TOKEN for private repository readback.");
  add("integration.forwarding", "owner_action", "optional", "Scoped intake keys are created within an authenticated workspace; no mailbox or forwarding provider is provisioned by configuration.", "Create a scoped intake key, configure the trusted forwarder and test a consented non-payment fixture with a stable external ID.");
  const notices = env.NOTIFICATIONS_ENABLED === "true";
  add("integration.notifications", !notices ? "disabled" : configured(env.TELEGRAM_BOT_TOKEN) && configured(env.TELEGRAM_CHAT_ID) && origin && env.APP_ORIGIN!.startsWith("https:") ? "configured" : "invalid", "optional", "Telegram notices need an explicitly selected destination and HTTPS app origin. The diagnostic never sends a message.", "Configure the bot and explicit workspace destination only after notification authorization.");
  const rawRelay = options.relay !== undefined ? options.relay : inlineJson(env.RELAY_CONFIG_JSON);
  const relay = currentRelay(rawRelay, now);
  const relayBinding = Boolean(relay && manifest && relay.organizationId === manifest.organizationId && relay.sourceChainId === manifest.chainId && same(relay.sourceModule, manifest.module) && same(relay.sourceSafe, manifest.safe) && same(relay.sourceToken, manifest.token) && relay.testnet === manifest.testnet && validHttp(relay.sourceRpcUrl) && validHttp(relay.destinationRpcUrl) && !same(relay.circle.wallet, manifest.verifier));
  add("relay.configuration", rawRelay !== undefined && !(relay && relayBinding) ? "invalid" : "disabled", "optional", "New cross-chain relay broadcasts are disabled in this release, including testnet routes. Existing source, provider and destination evidence can still be reconciled using original operation identities.", "Keep relay submission disabled. Source burn does not establish destination settlement; retain and reconcile original evidence.");
  add("owner.restore", "owner_action", "operations", "Backup presence is not proof of restore. Key recovery and original payment/outbox/relay identities require an isolated restore rehearsal.", "Run db:restore:verify before and after an isolated database restore, then authenticate and decrypt a consented fixture with execution disabled.");
  add("owner.financial", "owner_action", "execution", "Monetary authorization, independent security/recovery review, funding, provider terms, protection reserves and pilot consent are outside this diagnostic.", "Complete the owner checklist in docs/activation.md before monetary activation.");
  return {
    schemaVersion: 1, checkedAt: now.toISOString(), profile, probesRequested: false,
    workspaceConfigured: db && (profile === "worker" || (documentKey && origin)),
    executionConfigured: db && (profile === "worker" || (documentKey && origin)) && Boolean(manifest) && networkAllowed && bound && separated && rpcConfigured && enabled && !custodyInvalid && (profile === "worker" ? circleProfilePresent : verifierBound),
    mainnetEnabled: false,
    databaseVerified: false, deploymentVerified: false, financialActivationVerified: false, checks,
    limitations: ["Configured means a local structure check, not a working integration.", "Read-only probes cannot certify independent audit findings, provider terms, customer consent, protection capital or monetary authorization.", "No signing, transaction submission, model generation, provisioning, notification delivery or funding occurs."],
  };
}

export async function discoverMigrationRequirements(directory = "migrations"): Promise<MigrationRequirements> {
  const files = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("No migration requirements found");
  const tables = new Set<string>();
  const columns: Record<string, string[]> = {};
  for (const file of files) {
    const sql = (await readFile(join(directory, file), "utf8")).replace(/--[^\n]*/g, "");
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) tables.add(match[1].toLowerCase());
    for (const match of sql.matchAll(/ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) (columns[match[1].toLowerCase()] ??= []).push(match[2].toLowerCase());
  }
  return { versions: files.map((file) => file.slice(0, -4)), tables: [...tables].sort(), columns };
}

/** The caller must pass one dedicated connection, never a pool that can hop transactions. */
export async function verifyDatabaseSchema(db: Database, requirements: MigrationRequirements): Promise<{ status: "verified" | "failed"; detail: string }> {
  if (!requirements.versions.length || !requirements.versions.every((version) => /^\d{3}_[a-z0-9_]+$/.test(version))) return { status: "failed", detail: "Expected migration registry is absent or malformed." };
  await db.query("BEGIN READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout = '8000ms'");
    const registry = (await db.query<{ migration_table: string | null }>("SELECT to_regclass('public.schema_migrations')::text AS migration_table")).rows[0];
    if (!registry?.migration_table) return { status: "failed", detail: "Database is reachable; schema_migrations is missing. Run the migration command with a database administrator." };
    const applied = (await db.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version")).rows.map((row) => row.version);
    const missing = requirements.versions.filter((version) => !applied.includes(version));
    const unknown = applied.filter((version) => !requirements.versions.includes(version));
    const shape = (await db.query<{ table_name: string; column_name: string }>("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name")).rows;
    const missingTables = requirements.tables.filter((table) => !shape.some((row) => row.table_name === table));
    const missingColumns = Object.entries(requirements.columns).flatMap(([table, names]) => names.filter((column) => !shape.some((row) => row.table_name === table && row.column_name === column)).map((column) => `${table}.${column}`));
    if (missing.length || unknown.length || missingTables.length || missingColumns.length) return {
      status: "failed", detail: [missing.length ? `Missing migrations: ${missing.join(", ")}.` : "", unknown.length ? "Database includes migrations unknown to this application revision." : "", missingTables.length ? "Expected application tables are missing." : "", missingColumns.length ? "Expected security-control columns are missing." : ""].filter(Boolean).join(" "),
    };
    return { status: "verified", detail: "Database readback matches the exact migration version registry, expected tables and added security-control columns. Registry versions do not prove historical SQL contents or customer isolation." };
  } finally { await db.query("ROLLBACK"); }
}

async function readConfiguredJson(inline: string | undefined, path: string | undefined): Promise<unknown> {
  if (inline !== undefined && inline.trim()) return inlineJson(inline);
  if (!path) return undefined;
  try {
    const content = await readFile(path, "utf8");
    return inlineJson(content);
  } catch { return null; }
}

/** Explicit --probe readbacks use only read-only SQL, GET requests and chain reads. Errors are replaced with fixed descriptions to avoid credential leakage. */
export async function runActivationChecks(options: ProbeOptions = {}): Promise<ActivationReport> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const manifestInput = options.manifest !== undefined ? options.manifest : await readConfiguredJson(env.EXECUTION_MANIFEST_JSON, env.EXECUTION_MANIFEST_PATH);
  const relayInput = options.relay !== undefined ? options.relay : await readConfiguredJson(env.RELAY_CONFIG_JSON, env.RELAY_CONFIG_PATH);
  const report = inspectActivation({ ...options, env, now, manifest: manifestInput, relay: relayInput });
  if (!options.probe) return report;
  report.probesRequested = true;
  const add = (id: string, status: ActivationStatus, requiredFor: ActivationCheck["requiredFor"], detail: string, action?: string) => report.checks.push({ id, status, requiredFor, detail, ...(action ? { action } : {}) });
  if (validDatabase(env.DATABASE_URL)) {
    let pool: Pool | undefined;
    let release: (() => void) | undefined;
    try {
      let db = options.database;
      if (!db) {
        pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, application_name: "countersign-activation-readonly" });
        const client = await pool.connect();
        release = () => client.release();
        db = client;
      }
      const requirements = options.migrationRequirements ?? await discoverMigrationRequirements(options.migrationDirectory);
      const schema = await verifyDatabaseSchema(db, requirements);
      report.databaseVerified = schema.status === "verified";
      add("database.schema", schema.status, "workspace", schema.detail, "Use the exact application revision to migrate; never point production at an unrelated database.");
      if (report.databaseVerified) {
        try {
          const keys = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM intake_keys WHERE revoked_at IS NULL");
          add("forwarding.intake-key", Number(keys.rows[0]?.count ?? 0) > 0 ? "configured" : "missing", "optional", "Readback indicates whether an active scoped intake key exists. This does not prove an inbound provider, tenant-specific delivery or consent.");
        } catch { add("forwarding.intake-key", "failed", "optional", "Active intake-key readback failed; inspect workspace permissions privately."); }
      }
    } catch { add("database.schema", "failed", "workspace", "Database readback failed. Inspect connection, TLS, permissions and migration setup privately; credentials and database errors are redacted."); }
    finally { release?.(); await pool?.end(); }
  } else { add("database.schema", "missing", "workspace", "Database probe skipped because connection configuration is absent or invalid."); }
  const m = currentManifest(manifestInput, now);
  const rpc = env.SOURCE_RPC_URL || env.ARC_RPC_URL;
  if (m && validHttp(rpc)) {
    try {
      await verifyDeploymentManifest(m, rpc!);
      report.deploymentVerified = true;
      add("manifest.chain-evidence", "verified", "execution", "RPC readback matches chain ID, module bytecode hash and finalized successful compatibility/revocation transaction receipts. Success does not establish all transaction semantics or independent audit quality.");
    } catch { add("manifest.chain-evidence", "failed", "execution", "Exact deployment chain, bytecode or finalized transaction evidence could not be verified. Execution remains gated."); }
  } else { add("manifest.chain-evidence", "missing", "execution", "Chain-evidence readback requires a current manifest and valid source RPC."); }
  const fetcher = options.fetcher ?? fetch;
  const get = async (url: string, headers?: Record<string, string>) => boundedJson(await fetcher(url, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(8000) }), 64_000);
  let modelConfiguration: ModelConfiguration | null = null;
  try { modelConfiguration = readModelConfiguration(env); } catch { /* The local report already marks invalid selection; do not probe it. */ }
  if (modelConfiguration) {
    try {
      const config = modelConfiguration;
      const url = config.provider === "deepseek" ? "https://api.deepseek.com/models" : `https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`;
      const model = await get(url, { Authorization: `Bearer ${config.apiKey}` });
      const available = config.provider === "deepseek"
        ? z.object({ data: z.array(z.object({ id: z.string() })).max(1000) }).parse(model).data.some((item) => item.id === config.model)
        : z.object({ id: z.string() }).parse(model).id === config.model;
      add("model.access", available ? "verified" : "failed", "optional", "Read-only selected-provider model access lookup. No generation, extraction capability, output quality or production data consent is verified.");
    } catch { add("model.access", "failed", "optional", "Model access lookup failed; inspect the selected model and provider credential privately. No paid generation was attempted."); }
  }
  if (report.checks.find((c) => c.id === "integration.github")?.status === "configured") {
    try {
      const repo = await get(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}`, { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) }) as { full_name?: unknown };
      add("github.access", typeof repo.full_name === "string" && same(repo.full_name, env.GITHUB_REPOSITORY!) ? "verified" : "failed", "optional", "Read-only repository identity/access lookup. Pull-request evidence remains activity and cannot accept an invoice.");
    } catch { add("github.access", "failed", "optional", "GitHub read-only repository lookup failed; inspect repository scope and token permissions privately."); }
  }
  if (report.checks.find((c) => c.id === "integration.notifications")?.status === "configured") {
    try {
      const bot = await get(`https://api.telegram.org/bot${encodeURIComponent(env.TELEGRAM_BOT_TOKEN!)}/getMe`) as { ok?: unknown; result?: { is_bot?: unknown } };
      add("notifications.bot-identity", bot.ok === true && bot.result?.is_bot === true ? "verified" : "failed", "optional", "Read-only bot identity lookup. Destination membership, notification consent and message delivery are unverified; no message was sent.");
    } catch { add("notifications.bot-identity", "failed", "optional", "Telegram bot identity lookup failed; inspect credentials privately. No message was sent."); }
  }
  return report;
}

export function formatActivationReport(report: ActivationReport): string {
  const lines = [`Countersign activation — ${report.profile} — ${report.probesRequested ? "read-only probes" : "local checks"}`, `Workspace configuration: ${report.workspaceConfigured ? "configured" : "incomplete"}; database: ${report.databaseVerified ? "readback verified" : "unverified"}`, `Execution configuration: ${report.executionConfigured ? "configured" : "gated"}; deployment: ${report.deploymentVerified ? "readback verified" : "unverified"}`, "Financial activation: requires separate owner approval and external evidence", ""];
  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.id}: ${check.detail}`);
    if (check.action && ["missing", "invalid", "failed", "owner_action"].includes(check.status)) lines.push(`  Action: ${check.action}`);
  }
  return lines.join("\n");
}

export type RestoreSnapshot = {
  schemaVersion: 1;
  tables: Record<string, { count: number; commitment: string }>;
  matchesBaseline?: boolean;
  mismatchedTables?: string[];
};
const restoreQueries: Record<string, string> = {
  payment_intents: "SELECT id,organization_id,invoice_id,engagement_id,idempotency_key,amount::text,state,permit,provider_id,source_tx,destination_tx,invalidated_at,invalidation_reason,terminal_failure_proof FROM payment_intents ORDER BY id",
  outbox: "SELECT id,organization_id,kind,payload,dedupe_key,available_at,leased_until,lease_token,attempts,completed_at FROM outbox ORDER BY id",
  destination_relays: "SELECT id,organization_id,payment_id,source_tx,permit_digest,configuration_digest,destination_chain_id,destination_transmitter,destination_wallet,message_hash,message,attestation,state,attempts,provider_id,transaction_hash FROM destination_relays ORDER BY id",
  documents: "SELECT id,organization_id,commitment,encode(sha256(ciphertext),'hex') AS ciphertext_commitment,encode(sha256(iv),'hex') AS iv_commitment,encode(sha256(tag),'hex') AS tag_commitment FROM documents ORDER BY id",
  ledger_events: "SELECT id,organization_id,payment_id,external_key,body FROM ledger_events ORDER BY id",
  records: "SELECT organization_id,kind,id,version,body FROM records ORDER BY organization_id,kind,id",
  record_versions: "SELECT organization_id,kind,id,version,body FROM record_versions ORDER BY organization_id,kind,id,version",
  notification_deliveries: "SELECT organization_id,event_id,state,provider_message_id FROM notification_deliveries ORDER BY organization_id,event_id",
};
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("base64"));
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
/** Fingerprints encrypted originals and durable identities; never emits private rows. Run with workers stopped against a dedicated connection. */
export async function inspectRestoredIdentities(db: Database, baseline?: RestoreSnapshot): Promise<RestoreSnapshot> {
  const tables: RestoreSnapshot["tables"] = {};
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout = '30000ms'");
    for (const [table, sql] of Object.entries(restoreQueries)) {
      const rows = (await db.query(`${sql} LIMIT 100001`)).rows;
      if (rows.length > 100000) throw new Error("Restore fingerprint table exceeds the bounded diagnostic capacity; use the database provider's full restore verification procedure");
      tables[table] = { count: rows.length, commitment: createHash("sha256").update(canonical(rows)).digest("hex") };
    }
  } finally { await db.query("ROLLBACK"); }
  const snapshot: RestoreSnapshot = { schemaVersion: 1, tables };
  if (baseline) {
    if (baseline.schemaVersion !== 1 || !baseline.tables || Object.keys(baseline.tables).length !== Object.keys(tables).length) throw new Error("Invalid restore baseline");
    const mismatchedTables = Object.keys(tables).filter((table) => baseline.tables[table]?.count !== tables[table].count || baseline.tables[table]?.commitment !== tables[table].commitment);
    snapshot.matchesBaseline = mismatchedTables.length === 0;
    snapshot.mismatchedTables = mismatchedTables;
  }
  return snapshot;
}
