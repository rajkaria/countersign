import { setTimeout as sleep } from "node:timers/promises";
import { database, transaction } from "../src/lib/server/db";
import { runWorkerOnce, processPaymentJob } from "../src/lib/server/worker";
import {
  runStandingAutomation,
  persistStandingObservation,
} from "../src/lib/server/automation";
import { processOperationsNotice } from "../src/lib/server/notification-delivery";
import { evaluateInvoice } from "../src/lib/server/review";
import {
  CircleExecutor,
  circleConfigFromEnv,
} from "../src/lib/integrations/circle";
import {
  checkModuleDeployment,
  readSafe,
  chainClient,
  verifySourceSettlement,
} from "../src/lib/integrations/chain";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
  assertCurrentDeploymentManifest,
} from "../src/lib/integrations/manifest";
import { modulePermitSchema } from "../src/lib/integrations/module";
import { verifyReservedCoverage } from "../src/lib/integrations/coverage";
import { verifyObligation } from "../src/lib/domain";
import {
  runDestinationRelay,
  relayConfigFromEnv,
} from "../src/lib/integrations/relay";
import { verifyCctpDestination } from "../src/lib/integrations/cctp";
import type { Address, Hex } from "viem";
async function main() {
  const rpc = process.env.SOURCE_RPC_URL || process.env.ARC_RPC_URL;
  if (!rpc) throw new Error("SOURCE_RPC_URL is required.");
  // Expired review must not strand an existing uncertain operation after a restart.
  // New work still uses the strict verifier/preflight and Circle submission expiry checks below.
  const manifest = await loadDeploymentManifest({ purpose: "reconciliation" });
  if (!manifest)
    throw new Error("Reviewed EXECUTION_MANIFEST_PATH is required.");
  await verifyDeploymentManifest(manifest, rpc, { purpose: "reconciliation" });
  const config = {
    ...circleConfigFromEnv(),
    wallet: manifest.circleWallet,
    chain: manifest.circleChain,
    chainId: manifest.chainId,
    module: manifest.module,
    safe: manifest.safe,
    token: manifest.token,
    tenantId: manifest.organizationId,
    compatibilityVerified: true,
    revocationVerified: true,
    securityReviewApproved: true,
    deploymentEvidenceExpiresAt: manifest.expiresAt,
  };
  const circle = new CircleExecutor(config);
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
  });
  process.on("SIGTERM", () => {
    stopped = true;
  });
  let lastStandingScan = 0;
  const scan = async () => {
    const observation = await readSafe({
      rpcUrl: rpc,
      chainId: manifest.chainId,
      safe: manifest.safe as Address,
      token: manifest.token as Address,
      module: manifest.module as Address,
      historyBlocks: 10000,
    });
    return transaction(async (db) => {
      await persistStandingObservation(
        db,
        {
          organizationId: manifest.organizationId,
          safe: manifest.safe,
          chainId: manifest.chainId,
          sourceAdapter: process.env.CCTP_SOURCE_ADAPTER,
        },
        observation,
        async (block, hash) =>
          (await chainClient(rpc).getBlock({ blockNumber: BigInt(block) }))
            .hash === hash,
      );
      return runStandingAutomation(db, {
        organizationId: manifest.organizationId,
        notificationsEnabled: process.env.NOTIFICATIONS_ENABLED === "true",
      });
    });
  };
  do {
    if (lastStandingScan === 0 || Date.now() - lastStandingScan >= 60_000) {
      try {
        const result = await scan();
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            status: "standing-scan",
            scanned: result.scanned,
          }),
        );
      } catch {
        console.error(
          JSON.stringify({
            at: new Date().toISOString(),
            status: "standing-scan-failed",
            action:
              "Inspect current deployment, provider health, and worker database.",
          }),
        );
      }
      lastStandingScan = Date.now();
    }
    const result = await runWorkerOnce(
      database(),
      async (job) => {
        if (job.organization_id !== manifest.organizationId)
          throw new Error("Worker organization mismatch");
        if (job.kind === "reassess") {
          await scan();
          return;
        }
        if (job.kind === "notify") {
          await processOperationsNotice(database(), job,
            {
              enabled: process.env.NOTIFICATIONS_ENABLED === "true",
              organizationId: manifest.organizationId,
              botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
              chatId: process.env.TELEGRAM_CHAT_ID ?? "",
              appOrigin: process.env.APP_ORIGIN ?? "",
            },
          );
          return;
        }
        await processPaymentJob(database(), job, {
          revalidate: (payment) =>
            transaction(async (db) => {
              if (payment.organization_id !== manifest.organizationId)
                throw new Error("Worker cannot execute another organization");
              const wallet = String(
                payment.permit.authorizedBy ?? "",
              ).toLowerCase();
              const member = (
                await db.query<{ role: string }>(
                  "SELECT role FROM members WHERE organization_id=$1 AND wallet=$2",
                  [payment.organization_id, wallet],
                )
              ).rows[0];
              if (member?.role !== "owner")
                throw new Error(
                  "Original authorizing owner no longer has authority",
                );
              const result = await evaluateInvoice(
                db,
                {
                  wallet,
                  organizationId: payment.organization_id,
                  role: "owner",
                },
                payment.invoice_id,
                payment.id,
              );
              if (
                result.input.policy.coverageRequired &&
                result.decision.findings
                  .filter((f) => f.severity !== "info")
                  .every((f) => f.code === "COVERAGE_REQUIRED")
              )
                return verifyObligation({
                  ...result.input,
                  coverageReserved: await verifyReservedCoverage(
                    rpc,
                    modulePermitSchema.parse(payment.permit.modulePermit),
                  ),
                });
              return result.decision;
            }),
          preflight: async (permit) => {
            await verifyDeploymentManifest(manifest, rpc);
            await checkModuleDeployment({
              rpcUrl: rpc,
              permit,
              executor: manifest.circleWallet as Address,
            });
            assertCurrentDeploymentManifest(manifest);
          },
          submit: (request) => circle.submit(request),
          lookup: (id) => circle.lookup(id),
          source: (transaction, permit) =>
            verifySourceSettlement({ rpcUrl: rpc, transaction, permit }),
          destination: async (payment, permit) => {
            const relayConfig = await relayConfigFromEnv();
            if (relayConfig)
              return runDestinationRelay(
                database(),
                payment,
                permit,
                relayConfig,
              );
            const destinationRpc = process.env.DESTINATION_RPC_URL,
              message = payment.permit.cctpMessage;
            if (
              !destinationRpc ||
              !payment.destination_tx ||
              typeof message !== "string"
            )
              throw new Error(
                "Destination transaction and authenticated CCTP message are required; source remains pending",
              );
            return verifyCctpDestination({
              rpcUrl: destinationRpc,
              transaction: payment.destination_tx as Hex,
              message: message as Hex,
              permit,
              sourceDomain: Number(process.env.CCTP_SOURCE_DOMAIN),
              sourceMessenger: process.env.CCTP_SOURCE_MESSENGER as Address,
              destinationMessenger: process.env
                .CCTP_DESTINATION_MESSENGER as Address,
              sourceAdapter: process.env.CCTP_SOURCE_ADAPTER as Address,
              destinationTransmitter: process.env
                .CCTP_DESTINATION_TRANSMITTER as Address,
              destinationToken: process.env.CCTP_DESTINATION_TOKEN as Address,
              sourceTransaction: payment.source_tx as Hex,
              testnet: manifest.testnet,
            });
          },
        });
      },
      manifest.organizationId,
    );
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    if (process.argv.includes("--once")) break;
    if (!stopped) await sleep(result.status === "idle" ? 5000 : 250);
  } while (!stopped);
  await database().end();
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Worker stopped");
  process.exitCode = 1;
});
