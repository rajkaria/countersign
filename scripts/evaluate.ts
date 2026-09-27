import { readFile, writeFile } from "node:fs/promises";
import { evaluateExperiment } from "../src/lib/domain/evaluation";
async function main() {
  const [input, output, trustedCommitment] = process.argv.slice(2);
  if (!input) {
    console.error(
      "Usage: npx tsx scripts/evaluate.ts experiment.json [report.json] [trusted-manifest-commitment]",
    );
    process.exitCode = 2;
    return;
  }
  const raw = await readFile(input, "utf8");
  if (raw.length > 20_000_000)
    throw new Error("Evaluation bundle exceeds 20 MB");
  const report = evaluateExperiment(JSON.parse(raw), trustedCommitment);
  const encoded = JSON.stringify(report, null, 2) + "\n";
  if (output) await writeFile(output, encoded, { flag: "wx" });
  else console.log(encoded);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exitCode = 1;
});
