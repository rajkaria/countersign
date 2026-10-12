import assert from "node:assert/strict";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenPackage = /^(?:next|react|react-dom|lucide-react|typescript|tsx|esbuild|vite|vitest|eslint(?:-.*)?|braces|micromatch|fast-glob|@esbuild\/.*|@next\/.*|@vitest\/.*|@playwright\/.*|@eslint\/.*|@typescript\/.*|@typescript-eslint\/.*)$/;

export async function installedPackages(directory) {
  const packages = [];
  async function walk(modules) {
    for (const item of await readdir(modules, { withFileTypes: true })) {
      if (item.name.startsWith(".") || !item.isDirectory()) continue;
      const path = join(modules, item.name);
      if (item.name.startsWith("@")) {
        await walk(path);
        continue;
      }
      const manifest = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
      packages.push({ name: manifest.name, version: manifest.version });
      try { await access(join(path, "node_modules")); }
      catch { continue; }
      await walk(join(path, "node_modules"));
    }
  }
  await walk(directory);
  return packages;
}

export async function assertRuntime(profile) {
  assert.ok(["financial", "operations"].includes(profile), "Runtime profile is required");
  assert.notEqual(process.getuid(), 0, "Workers must run as a non-root user");
  assert.equal(process.env.EXECUTION_ENABLED, "false", "Smoke checks must disable payments");
  assert.equal(process.env.NOTIFICATIONS_ENABLED, "false", "Smoke checks must disable messages");
  const packages = await installedPackages("/app/node_modules");
  if (profile === "financial") {
    const cli = await installedPackages("/opt/circle/node_modules");
    assert.ok(cli.some((dependency) => dependency.name === "@circle-fin/cli" && dependency.version === "1.1.4"), "Exact reviewed Circle CLI is required");
    assert.equal(await realpath("/usr/local/bin/circle"), "/opt/circle/node_modules/@circle-fin/cli/dist/index.js");
    packages.push(...cli);
  } else {
    await assert.rejects(access("/opt/circle"), { code: "ENOENT" });
    await assert.rejects(access("/usr/local/bin/circle"), { code: "ENOENT" });
    for (const key of ["VERIFIER_PRIVATE_KEY", "CIRCLE_CLI_HOME", "CIRCLE_AGENT_WALLET", "EXECUTION_MANIFEST_PATH", "DOCUMENT_ENCRYPTION_KEY"]) {
      assert.equal(process.env[key], undefined, `Operations smoke must have no ${key}`);
    }
  }
  for (const directory of ["/app/src", "/app/scripts", "/app/.next", "/app/internal", "/app/.ocean"]) {
    await assert.rejects(access(directory), { code: "ENOENT" });
  }
  const forbidden = packages.filter((dependency) => forbiddenPackage.test(dependency.name));
  assert.deepEqual(forbidden, [], "Final images must exclude framework, compiler, lint, test and vulnerable development glob packages");
  console.log(JSON.stringify({ profile, nonRoot: true, runtimePackages: packages.length, forbiddenPackages: 0, executionEnabled: false, notificationsEnabled: false }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await assertRuntime(process.argv[2]);
}
