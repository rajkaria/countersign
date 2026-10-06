import { z } from "zod";
import { id, type Database } from "./db";
import type { OutboxJob } from "./worker";
import {
  operationsDesk,
  readOperationsPreferences,
  digestWindow,
} from "./operations";
import { notifyOperator } from "../integrations/notifications";
export type NoticeConfig = Parameters<typeof notifyOperator>[1];
type Sender = typeof notifyOperator;
/** Leased outbox identity is retained during quiet hours; no retry attempt is consumed. */
export async function processOperationsNotice(
  db: Database,
  job: OutboxJob,
  config: NoticeConfig,
  send: Sender = notifyOperator,
  now = new Date().toISOString(),
) {
  if (
    !["notify", "operations.notify"].includes(job.kind) ||
    config.organizationId !== job.organization_id
  )
    throw new Error("Notification job does not match the configured workspace");
  const eventId = z.uuid().parse(job.payload.eventId);
  const event = {
    organizationId: job.organization_id,
    eventId,
    kind: z
      .enum(["exception", "overdue", "stuck_payment", "coverage_capacity"])
      .parse(job.payload.kind),
    summary: z.string().min(1).max(500).parse(job.payload.summary),
  };
  const { preferences } = await readOperationsPreferences(
    db,
    job.organization_id,
  );
  if (!config.enabled || !preferences.notificationsEnabled)
    return { status: "disabled" as const };
  if (
    !config.botToken ||
    !config.chatId ||
    new URL(config.appOrigin).protocol !== "https:"
  )
    throw new Error(
      "Explicit notification destination and HTTPS origin required",
    );
  if (!digestWindow(preferences, now).allowed) {
    let next = Date.parse(now) + 60000;
    // Check timezone-aware wall time; this also handles daylight-saving transitions.
    while (
      next < Date.parse(now) + 27 * 3600000 &&
      !digestWindow(preferences, new Date(next).toISOString()).allowed
    )
      next += 60000;
    if (!digestWindow(preferences, new Date(next).toISOString()).allowed)
      return { status: "disabled" as const };
    await db.query(
      "UPDATE outbox SET available_at=$3,leased_until=NULL,lease_token=NULL,attempts=greatest(attempts-1,0) WHERE id=$1 AND lease_token=$2",
      [job.id, job.lease_token, new Date(next).toISOString()],
    );
    return {
      status: "deferred" as const,
      availableAt: new Date(next).toISOString(),
    };
  }
  const lease = (
    await db.query(
      "SELECT id FROM outbox WHERE id=$1 AND organization_id=$2 AND lease_token=$3 AND leased_until>now() AND completed_at IS NULL",
      [job.id, job.organization_id, job.lease_token],
    )
  ).rows;
  if (!lease.length) throw new Error("Notification worker lease lost");
  const inserted = await db.query(
    "INSERT INTO notification_deliveries(organization_id,event_id,state) VALUES($1,$2,'sending') ON CONFLICT DO NOTHING RETURNING event_id",
    [job.organization_id, eventId],
  );
  if (!inserted.rows.length) {
    const existing = (
      await db.query<{ state: string }>(
        "SELECT state FROM notification_deliveries WHERE organization_id=$1 AND event_id=$2",
        [job.organization_id, eventId],
      )
    ).rows[0];
    return {
      status:
        existing?.state === "sent" ? ("sent" as const) : ("uncertain" as const),
    };
  }
  try {
    const result = await send(event, config);
    if (!result.sent || !("messageId" in result))
      throw new Error("Notification delivery was not confirmed");
    await db.query(
      "UPDATE notification_deliveries SET state='sent',provider_message_id=$3,updated_at=now() WHERE organization_id=$1 AND event_id=$2",
      [job.organization_id, eventId, String(result.messageId)],
    );
    return { status: "sent" as const };
  } catch {
    // Sending was persisted before the provider call. Crashes/timeouts cannot create an automatic duplicate.
    await db.query(
      "UPDATE notification_deliveries SET state='uncertain',updated_at=now() WHERE organization_id=$1 AND event_id=$2",
      [job.organization_id, eventId],
    );
    return { status: "uncertain" as const };
  }
}
/** One daily actionable digest, independently of payment delegation. Caller holds a transaction. */
export async function queueOperationsDigest(
  db: Database,
  organizationId: string,
  now = new Date().toISOString(),
) {
  const org = z.uuid().parse(organizationId);
  const desk = await operationsDesk(
    db,
    {
      organizationId: org,
      wallet: "system:operations-reminders",
      role: "viewer",
    },
    now,
  );
  if (
    !desk.preferences.preferences.notificationsEnabled ||
    !desk.digest.notices.length
  )
    return { enqueued: false, reason: "disabled_or_no_actionable_work" };
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: desk.preferences.preferences.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const summary =
    `Daily review: ${desk.digest.notices.length} actionable item(s). ` +
    desk.digest.notices
      .slice(0, 3)
      .map((n) => n.message)
      .join(" ");
  const eventId = id();
  const inserted = await db.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'operations.notify',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",
    [
      eventId,
      org,
      JSON.stringify({
        eventId,
        kind: "exception",
        summary: summary.slice(0, 500),
      }),
      `operations:digest:${org}:${date}`,
    ],
  );
  return { enqueued: inserted.rows.length > 0, date };
}
