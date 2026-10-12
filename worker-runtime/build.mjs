import { build } from "esbuild";
import { builtinModules } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = fileURLToPath(new URL("dist/", import.meta.url));
const allowedPackages = new Set(["pg", "zod", "viem"]);
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
await mkdir(directory, { recursive: true });

for (const [name, entry] of [
  ["worker", "scripts/worker.ts"],
  ["operations-worker", "scripts/operations-worker.ts"],
]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    outfile: `${directory}${name}.mjs`,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: false,
    metafile: true,
    logLevel: "warning",
  });
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      const specifier = dependency.path.replace(/^node:/, "");
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (!builtins.has(specifier) && !allowedPackages.has(packageName)) {
        throw new Error(`Unexpected ${name} runtime dependency: ${dependency.path}`);
      }
    }
  }
  await writeFile(`${directory}${name}.metafile.json`, JSON.stringify(result.metafile, null, 2) + "\n");
}
console.log("Built the existing financial and operations worker entrypoints for Node 22.");
