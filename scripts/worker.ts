import { setTimeout as sleep } from "node:timers/promises";
import { database, transaction } from "../src/lib/server/db";
import { runWorkerOnce, processPaymentJob } from "../src/lib/server/worker";
import { evaluateInvoice } from "../src/lib/server/review";
import {
  CircleExecutor,
  circleConfigFromEnv,
} from "../src/lib/integrations/circle";
import {
  checkModuleDeployment,
  verifySourceSettlement,
} from "../src/lib/integrations/chain";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
} from "../src/lib/integrations/manifest";
import { modulePermitSchema } from "../src/lib/integrations/module";
import { verifyReservedCoverage } from "../src/lib/integrations/coverage";
import { verifyObligation } from "../src/lib/domain";
import { verifyCctpDestination } from "../src/lib/integrations/cctp";
import type { Address, Hex } from "viem";
async function main() {
  const rpc = process.env.SOURCE_RPC_URL || process.env.ARC_RPC_URL;
  if (!rpc) throw new Error("SOURCE_RPC_URL is required.");
  const manifest = await loadDeploymentManifest();
  if (!manifest)
    throw new Error("Reviewed EXECUTION_MANIFEST_PATH is required.");
  await verifyDeploymentManifest(manifest, rpc);
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
  };
  const circle = new CircleExecutor(config);
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
  });
  process.on("SIGTERM", () => {
    stopped = true;
  });
  do {
    const result = await runWorkerOnce(database(), (job) =>
      processPaymentJob(database(), job, {
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
        },
        submit: (request) => circle.submit(request),
        lookup: (id) => circle.lookup(id),
        source: (transaction, permit) =>
          verifySourceSettlement({ rpcUrl: rpc, transaction, permit }),
        destination: async (payment, permit) => {
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
      }),
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
