import { readFile } from "node:fs/promises";
import { verifyReceipt } from "../src/lib/domain/receipt";
async function main() {
  const [, , path, trustedCommitment] = process.argv;
  if (!path) {
    console.error(
      "Usage: npm run receipt:verify -- receipt.json [trusted-0x-sha256]",
    );
    process.exitCode = 2;
    return;
  }
  const data = await readFile(path, "utf8");
  if (data.length > 2_000_000) throw new Error("Receipt exceeds 2 MB limit");
  const result = verifyReceipt(JSON.parse(data), trustedCommitment);
  console.log(JSON.stringify(result, null, 2));
  if (!result.integrityValid) process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Receipt verification failed",
  );
  process.exitCode = 1;
});
