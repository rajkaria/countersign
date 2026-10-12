import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

let isolation;
before(async () => {
  isolation = await mkdtemp(join(tmpdir(), "countersign-packaging-"));
  await writeFile(join(isolation, "no-network.mjs"), `
    import net from "node:net";
    const deny = () => { throw new Error("Packaging smoke attempted a network call"); };
    net.Socket.prototype.connect = deny;
    globalThis.fetch = deny;
  `);
});
after(async () => { await rm(isolation, { recursive: true, force: true }); });

function runBundle(name, args = [], environment = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(`dist/${name}.mjs`, import.meta.url)), ...args], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      NODE_OPTIONS: `--import=${join(isolation, "no-network.mjs")}`,
      EXECUTION_ENABLED: "false",
      NOTIFICATIONS_ENABLED: "false",
      ...environment,
    },
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error) throw result.error;
  assert.doesNotMatch(result.stdout + result.stderr, /Packaging smoke attempted a network call/);
  return result;
}

test("final worker images install only dedicated locked production dependencies", async () => {
  for (const name of ["Dockerfile.worker", "Dockerfile.operations-worker"]) {
    const dockerfile = await readFile(new URL(`../${name}`, import.meta.url), "utf8");
    const finalStage = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
    assert.doesNotMatch(finalStage, /--include=dev|--import.*tsx|COPY src\/lib|COPY package\.json package-lock/);
    assert.match(finalStage, /worker-runtime\/package\.json worker-runtime\/package-lock\.json/);
    assert.match(finalStage, /npm ci --omit=dev --ignore-scripts/);
    assert.match(finalStage, /USER node/);
  }
});

test("bundled operations startup validates without contacting its deliberately unreachable database", () => {
  const result = runBundle("operations-worker", [], {
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    OPERATIONS_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout.trim());
  assert.equal(value.status, "configuration-valid");
  assert.equal(value.notificationsEnabled, false);
  assert.equal(value.financialExecution, false);
});

test("bundled financial worker fails closed before database or provider access without a source RPC", () => {
  const result = runBundle("worker", ["--once"]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "SOURCE_RPC_URL is required.");
});

test("operations bundle excludes financial execution, model extraction and framework source", async () => {
  const metafile = JSON.parse(await readFile(new URL("dist/operations-worker.metafile.json", import.meta.url), "utf8"));
  const sources = Object.values(metafile.outputs).flatMap((output) => Object.keys(output.inputs));
  assert.ok(sources.some((path) => path.endsWith("scripts/operations-worker.ts")));
  assert.ok(sources.every((path) => !/server\/authorization|integrations\/(?:circle|relay|agent)|server\/extraction|src\/app|src\/components/.test(path)));
  const imports = Object.values(metafile.outputs).flatMap((output) => output.imports.map((dependency) => dependency.path));
  assert.ok(imports.every((path) => !/child_process|viem\/accounts|next|react/.test(path)));
  const bundle = await readFile(new URL("dist/operations-worker.mjs", import.meta.url), "utf8");
  // Shared record schemas retain inert ABI declarations; no financial client or dispatcher is emitted.
  assert.doesNotMatch(bundle, /function (?:chainClient|checkModuleDeployment|verifySourceSettlement|processPaymentJob)|class CircleExecutor|\.signTypedData\(/);
});
