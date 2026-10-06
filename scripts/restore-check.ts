import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import { inspectRestoredIdentities, type RestoreSnapshot } from "../src/lib/server/activation";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) {
  console.log("Usage: node --env-file=/secure/restore.env --import tsx scripts/restore-check.ts --snapshot=/secure/baseline.json\n       node --env-file=/secure/restored.env --import tsx scripts/restore-check.ts --compare=/secure/baseline.json\nExplicit modes perform read-only fingerprinting of the selected database. Stop all workers, set EXECUTION_ENABLED=false, and restore into an isolated database with no executor credentials. Output contains commitments and counts only. Snapshot files are created with mode 0600 and never overwritten. This is identity/encrypted-byte preservation evidence; also test document-key recovery and authenticated tenant isolation.");
} else {
  let pool: Pool | undefined;
  try {
    if (args.length !== 1 || !/^--(snapshot|compare)=.+$/.test(args[0])) throw new Error("Invalid mode");
    if (!process.env.DATABASE_URL || process.env.EXECUTION_ENABLED !== "false" || process.env.VERIFIER_PRIVATE_KEY || process.env.CIRCLE_CLI_HOME || process.env.CIRCLE_AGENT_WALLET) throw new Error("Restore environment must disable execution and omit executor/verifier identities");
    const mode = args[0].startsWith("--snapshot=") ? "snapshot" : "compare";
    const path = args[0].slice(args[0].indexOf("=") + 1);
    let baseline: RestoreSnapshot | undefined;
    if (mode === "compare") {
      const content = await readFile(path, "utf8");
      if (content.length > 32_000) throw new Error("Oversized baseline");
      baseline = JSON.parse(content) as RestoreSnapshot;
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, application_name: "countersign-isolated-restore-check" });
    const client = await pool.connect();
    try {
      const snapshot = await inspectRestoredIdentities(client, baseline);
      if (mode === "snapshot") await writeFile(path, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify(snapshot, null, 2));
      if (snapshot.matchesBaseline === false) process.exitCode = 1;
    } finally { client.release(); }
  } catch {
    console.error("Restore verification failed. Inspect the isolated database, application schema, disabled-execution environment and private baseline file. Secrets and database errors are redacted.");
    process.exitCode = 1;
  } finally { await pool?.end(); }
}
