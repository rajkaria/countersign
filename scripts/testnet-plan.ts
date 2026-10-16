import { constants } from "node:fs";
import { mkdir, open, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { createTestnetApprovalPlan, probeTestnetApproval, type TestnetApprovalReader } from "../src/lib/integrations/testnet-approval";

const help = `Usage: tsx scripts/testnet-plan.ts --input /private/input.json --out /private/new-directory [--probe]
Creates an unsigned Arc-testnet-only owner approval proposal. Default is offline.
--probe adds finalized read-only RPC checks using SOURCE_RPC_URL or ARC_RPC_URL.
Input must be a private regular JSON file (0600), at most 64 KiB, with public identities only.
Output must be a new directory outside the app repository; directory 0700, files 0600.
No wallet login, signature, send, funding, provider/model call or security approval occurs.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { console.log(help); return; }
  let inputPath: string | undefined, outputPath: string | undefined, probe = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--probe" && !probe) probe = true;
    else if ((arg === "--input" || arg === "--out") && args[i + 1] && !args[i + 1].startsWith("--")) {
      if (arg === "--input" && !inputPath) inputPath = args[++i];
      else if (arg === "--out" && !outputPath) outputPath = args[++i];
      else throw new Error("Duplicate argument");
    } else throw new Error("Invalid arguments");
  }
  if (!inputPath || !outputPath) throw new Error("Input and output are required");
  const file = await open(resolve(inputPath), constants.O_RDONLY | constants.O_NOFOLLOW);
  let raw: unknown;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 65_536 || (info.mode & 0o077) !== 0) throw new Error("Private bounded input required");
    const buffer = Buffer.alloc(65_537);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 65_536) throw new Error("Input too large");
    raw = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally { await file.close(); }
  const now = new Date(), plan = createTestnetApprovalPlan(raw, now);
  const appRoot = await realpath(fileURLToPath(new URL("..", import.meta.url)));
  const requestedOut = resolve(outputPath), parent = await realpath(dirname(requestedOut));
  const out = join(parent, basename(requestedOut)), rel = relative(appRoot, out);
  if (!rel || (rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep))) throw new Error("Output must be outside the app repository");
  let preflight: Awaited<ReturnType<typeof probeTestnetApproval>> | undefined;
  if (probe) {
    const rpc = process.env.SOURCE_RPC_URL || process.env.ARC_RPC_URL;
    if (!rpc) throw new Error("Read-only RPC is required");
    const url = new URL(rpc);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid RPC protocol");
    const client = createPublicClient({ transport: http(rpc, { retryCount: 0, timeout: 10_000 }) });
    const reader: TestnetApprovalReader = {
      getChainId: () => client.getChainId(),
      getBlock: (request) => client.getBlock(request),
      getCode: (request) => client.getCode(request),
      readContract: (request) => client.readContract(request),
    };
    preflight = await probeTestnetApproval(raw, reader, now);
  }
  // A slow RPC must not leave an already expired proposal on disk.
  createTestnetApprovalPlan(raw, new Date());
  await mkdir(out, { mode: 0o700 });
  if (((await stat(out)).mode & 0o777) !== 0o700) throw new Error("Private output permissions required");
  const writeNew = async (name: string, value: unknown) => {
    const target = await open(join(out, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await target.writeFile(JSON.stringify(value, null, 2) + "\n"); } finally { await target.close(); }
  };
  await writeNew("plan.json", plan);
  if (preflight) await writeNew("preflight.json", preflight);
  console.log(`Unsigned testnet proposal saved; execution remains disabled. Plan hash: ${plan.planHash}`);
}

main().catch(() => {
  console.error("Testnet approval plan failed. Validate public input, private paths and read-only RPC settings. No approval or execution occurred.");
  process.exitCode = 1;
});
