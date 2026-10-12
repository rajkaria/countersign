import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const [financialImage = "countersign-worker:test", operationsImage = "countersign-operations-worker:test"] = process.argv.slice(2);
const isolated = [
  "run", "--rm", "--network", "none", "--read-only",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
  "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--pids-limit", "128", "--memory", "512m",
];

function docker(args, expectedStatus = 0) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result.stdout + result.stderr;
}

function run(image, args, { entrypoint = "node", environment = {}, expectedStatus = 0, network = "none" } = {}) {
  return docker([
    ...isolated.map((value) => value === "none" ? network : value),
    ...Object.entries(environment).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--entrypoint", entrypoint, image, ...args,
  ], expectedStatus);
}

run(financialImage, ["assert-runtime.mjs", "financial"]);
run(operationsImage, ["assert-runtime.mjs", "operations"]);
assert.match(run(financialImage, ["--version"], { entrypoint: "circle" }), /1\.1\.4/);
const executeHelp = run(financialImage, ["wallet", "execute", "--help"], { entrypoint: "circle" });
for (const option of ["--contract", "--address", "--chain", "--amount", "--idempotency-key", "--estimate", "--output"]) assert.ok(executeHelp.includes(option), `Circle execute contract is missing ${option}`);
const listHelp = run(financialImage, ["wallet", "list", "--help"], { entrypoint: "circle" });
for (const option of ["--chain", "--type", "--output"]) assert.ok(listHelp.includes(option), `Circle wallet lookup contract is missing ${option}`);
const transactionHelp = run(financialImage, ["transaction", "list", "--help"], { entrypoint: "circle" });
for (const option of ["--address", "--chain", "--operation", "--limit", "--cursor", "--output"]) assert.ok(transactionHelp.includes(option), `Circle reconciliation contract is missing ${option}`);
assert.match(run(financialImage, ["worker.mjs", "--once"], { expectedStatus: 1 }), /SOURCE_RPC_URL is required/);
assert.match(run(operationsImage, ["operations-worker.mjs", "--help"]), /validate local configuration only/);
const fixture = {
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  OPERATIONS_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
};
const validated = JSON.parse(run(operationsImage, ["operations-worker.mjs"], { environment: fixture }).trim());
assert.equal(validated.status, "configuration-valid");
assert.equal(validated.notificationsEnabled, false);
assert.equal(validated.financialExecution, false);
assert.match(run(operationsImage, ["operations-worker.mjs"], { environment: { ...fixture, EXECUTION_ENABLED: "true" }, expectedStatus: 1 }), /Remove financial execution credentials/);
assert.match(run(operationsImage, ["operations-worker.mjs"], { environment: { ...fixture, VERIFIER_PRIVATE_KEY: "smoke-fixture-forbidden-custody" }, expectedStatus: 1 }), /Remove financial execution credentials/);
assert.match(run(operationsImage, ["operations-worker.mjs", "--run", "--once"], { environment: fixture, expectedStatus: 1 }), /could not start/);

// An internal Docker network permits only a disposable database fixture, with no external route.
const network = `countersign-worker-smoke-${process.pid}`;
const database = `countersign-worker-database-${process.pid}`;
const postgresImage = "postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826";
try {
  docker(["network", "create", "--internal", network]);
  docker(["run", "--detach", "--rm", "--pull=never", "--network", network, "--name", database,
    "--tmpfs", "/var/lib/postgresql/data:rw", "--env", "POSTGRES_USER=countersign",
    "--env", "POSTGRES_DB=countersign", "--env", "POSTGRES_PASSWORD=container-smoke-fixture", postgresImage]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync("docker", ["exec", database, "pg_isready", "--username=countersign", "--dbname=countersign"], { encoding: "utf8", timeout: 5000 });
    if (result.status === 0) { ready = true; break; }
    await sleep(1000);
  }
  assert.equal(ready, true, "Disposable fixture database did not become ready");
  docker(["exec", database, "psql", "--username=countersign", "--dbname=countersign", "--set", "ON_ERROR_STOP=1", "--command",
    "CREATE TABLE organizations(id uuid PRIMARY KEY); INSERT INTO organizations VALUES ('11111111-1111-4111-8111-111111111111');"]);
  const result = run(operationsImage, ["operations-worker.mjs", "--run", "--once"], {
    network,
    environment: { ...fixture, DATABASE_URL: `postgresql://countersign:container-smoke-fixture@${database}:5432/countersign` },
  });
  const cycle = JSON.parse(result.trim().split("\n").at(-1));
  assert.equal(cycle.status, "disabled");
  assert.equal(cycle.enqueued, false);
  assert.equal(cycle.financialExecution, false);
} finally {
  // Cleanup only these process-specific fixtures, including after a failed acceptance assertion.
  spawnSync("docker", ["rm", "--force", database], { timeout: 10000 });
  spawnSync("docker", ["network", "rm", network], { timeout: 10000 });
}
console.log("Both final images passed non-root, package isolation, offline CLI/startup and isolated database startup checks. No live credentials or provider effects were used.");
