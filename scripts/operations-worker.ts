import { setTimeout as sleep } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
import { operationsDesk } from "../src/lib/server/operations";
import { operationsWorkerConfig, runOperationsWorkerOnce } from "./operations-worker-loop";

const args = process.argv.slice(2);
const help = "Usage: npm run worker:operations -- [--preview | --run] [--once]\nDefault: validate local configuration only; no database or network calls. --preview reads the configured workspace without queueing/sending. --run starts the separate persistent reminder worker; workspace opt-in and explicit global notification configuration are required for delivery. Financial jobs, manifests, Circle profiles and verifier keys are not used.";
let pool: Pool | undefined;
const controller = new AbortController();
try {
  if (args.some((arg) => !["--help", "--preview", "--run", "--once"].includes(arg)) || (args.includes("--preview") && args.includes("--run"))) throw new Error("Unknown or conflicting operations worker options");
  if (args.includes("--help")) console.log(help);
  else {
    const config = operationsWorkerConfig();
    if (!args.includes("--run") && !args.includes("--preview")) console.log(JSON.stringify({ status: "configuration-valid", notificationsEnabled: config.enabled, financialExecution: false, action: "Use --preview for a read-only workspace preview or --run to start the persisted reminder loop." }));
    else {
      pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, application_name: "countersign-operations-worker" });
      pool.on("error", () => { console.error(JSON.stringify({ at: new Date().toISOString(), status: "operations-database-disconnected", action: "The next cycle will retry the private database connection." })); });
      const client = await pool.connect();
      let initialReleased = false;
      try {
        if (!(await client.query("SELECT id FROM organizations WHERE id=$1", [config.organizationId])).rows.length) throw new Error("Configured organization does not exist");
        if (args.includes("--preview")) {
          await client.query("BEGIN READ ONLY");
          try {
            const desk = await operationsDesk(client, { organizationId: config.organizationId, wallet: "system:operations-preview", role: "viewer" });
            console.log(JSON.stringify({ status: "preview", notices: desk.digest.notices.length, workspaceOptIn: desk.preferences.preferences.notificationsEnabled, permittedNow: desk.digest.allowed, queued: false, sent: false, financialExecution: false }));
          } finally { await client.query("ROLLBACK"); }
        } else {
          client.release();
          initialReleased = true;
          process.once("SIGINT", () => controller.abort());
          process.once("SIGTERM", () => controller.abort());
          console.log(JSON.stringify({ at: new Date().toISOString(), status: "operations-worker-started", notificationsEnabled: config.enabled, financialExecution: false }));
          let lastDigest = 0;
          do {
            let cycleClient: PoolClient | undefined;
            try {
              cycleClient = await pool.connect();
              const queueDigest = Date.now() - lastDigest >= 60_000;
              const result = await runOperationsWorkerOnce(cycleClient, config, queueDigest);
              cycleClient.release();
              cycleClient = undefined;
              if (queueDigest) lastDigest = Date.now();
              if (!["idle", "disabled"].includes(result.status) || args.includes("--once")) console.log(JSON.stringify({ at: new Date().toISOString(), ...result, financialExecution: false }));
            } catch {
              cycleClient?.release(true);
              console.error(JSON.stringify({ at: new Date().toISOString(), status: "operations-cycle-failed", action: "Inspect private database configuration, migrations and operations preferences. No secret or provider error is printed." }));
              if (args.includes("--once")) process.exitCode = 1;
            }
            if (args.includes("--once") || controller.signal.aborted) break;
            await sleep(5000, undefined, { signal: controller.signal }).catch(() => {});
          } while (!controller.signal.aborted);
        }
      } finally { if (!initialReleased) client.release(); }
    }
  }
} catch {
  console.error("Operations worker could not start. Check its dedicated database/organization environment and explicit notification destination. Remove financial execution credentials. Secrets and provider errors are redacted. Use --help for options.");
  process.exitCode = 1;
} finally { await pool?.end(); }
