import { z } from "zod";
import type { Database } from "../src/lib/server/db";
import { claimJob, completeJob, failJob } from "../src/lib/server/worker";
import { processOperationsNotice, queueOperationsDigest, type NoticeConfig } from "../src/lib/server/notification-delivery";

/** Operations reminders carry no execution manifest, Circle profile or verifier key. */
export function operationsWorkerConfig(env: Record<string, string | undefined> = process.env): NoticeConfig {
  if (!env.DATABASE_URL || env.EXECUTION_ENABLED === "true" || env.VERIFIER_PRIVATE_KEY || env.CIRCLE_CLI_HOME || env.CIRCLE_AGENT_WALLET) throw new Error("Operations worker requires a database and an environment without financial custody");
  const organizationId = z.uuid().parse(env.OPERATIONS_ORGANIZATION_ID);
  const config = { enabled: env.NOTIFICATIONS_ENABLED === "true", organizationId, botToken: env.TELEGRAM_BOT_TOKEN ?? "", chatId: env.TELEGRAM_CHAT_ID ?? "", appOrigin: env.APP_ORIGIN ?? "" };
  if (config.enabled) {
    const origin = new URL(config.appOrigin);
    if (!config.botToken || !config.chatId || origin.protocol !== "https:" || config.appOrigin !== origin.origin || origin.username || origin.password) throw new Error("Enabled notices require an explicit destination and canonical HTTPS origin");
  }
  return config;
}

/** Pass a dedicated database connection; queueing has its own short transaction before provider delivery. */
export async function runOperationsWorkerOnce(db: Database, config: NoticeConfig, queueDigest = true) {
  if (!config.enabled) return { status: "disabled" as const, enqueued: false };
  let enqueued = false;
  if (queueDigest) {
    await db.query("BEGIN");
    try {
      enqueued = (await queueOperationsDigest(db, config.organizationId)).enqueued;
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
  }
  const job = await claimJob(db, config.organizationId, ["operations.notify"]);
  if (!job) return { status: "idle" as const, enqueued };
  try {
    const delivery = await processOperationsNotice(db, job, config);
    if (delivery.status !== "deferred" && !(await completeJob(db, job))) return { status: "lease-lost" as const, enqueued };
    return { status: delivery.status, enqueued };
  } catch {
    await failJob(db, job, "Operations notice failed before confirmed completion; inspect private configuration and delivery evidence.");
    return { status: job.attempts >= 8 ? "attention-required" as const : "retry-scheduled" as const, enqueued };
  }
}
