import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Database } from "../../src/lib/server/db";
import type { OutboxJob } from "../../src/lib/server/worker";
import {
  queueOperationsDigest,
  processOperationsNotice,
} from "../../src/lib/server/notification-delivery";
import {
  saveOperationsPreferences,
  defaultPreferences,
} from "../../src/lib/server/operations";
let pg: PGlite, db: Database;
const org = "11111111-1111-4111-8111-111111111111";
const actor = {
  organizationId: org,
  wallet: `0x${"11".repeat(20)}`,
  role: "owner" as const,
};
const config = {
  enabled: true,
  organizationId: org,
  botToken: "secret-token",
  chatId: "target",
  appOrigin: "https://example.com",
};
let job: OutboxJob;
beforeAll(async () => {
  pg = new PGlite();
  for (const f of [
    "001_foundation",
    "002_security_controls",
    "005_notice_delivery",
  ])
    await pg.exec(await readFile(`migrations/${f}.sql`, "utf8"));
  db = pg as unknown as Database;
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE");
  await pg.query("INSERT INTO organizations(id,name) VALUES($1,'Notices')", [
    org,
  ]);
  await pg.query("INSERT INTO members VALUES($1,$2,'owner')", [
    org,
    actor.wallet,
  ]);
  job = {
    id: crypto.randomUUID(),
    organization_id: org,
    kind: "notify",
    payload: {
      eventId: crypto.randomUUID(),
      kind: "exception",
      summary: "Missing acceptance",
    },
    lease_token: crypto.randomUUID(),
    attempts: 1,
  };
  await pg.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key,lease_token,leased_until) VALUES($1,$2,'notify',$3,$4,$5,now()+interval '90 seconds')",
    [job.id, org, JSON.stringify(job.payload), job.id, job.lease_token],
  );
});
afterAll(() => pg.close());
it("requires both operator and workspace opt-in without sending", async () => {
  const send = vi.fn();
  expect((await processOperationsNotice(db, job, config, send)).status).toBe(
    "disabled",
  );
  expect(send).not.toHaveBeenCalled();
  await saveOperationsPreferences(db, actor, {
    expectedVersion: 0,
    preferences: { ...defaultPreferences, notificationsEnabled: true },
  });
  expect(
    (
      await processOperationsNotice(
        db,
        job,
        { ...config, enabled: false },
        send,
      )
    ).status,
  ).toBe("disabled");
  expect(send).not.toHaveBeenCalled();
});
it("records uncertain delivery before any retry and never resends an unknown event", async () => {
  await saveOperationsPreferences(db, actor, {
    expectedVersion: 0,
    preferences: { ...defaultPreferences, notificationsEnabled: true },
  });
  const send = vi.fn().mockRejectedValue(new Error("transport timeout"));
  expect((await processOperationsNotice(db, job, config, send)).status).toBe(
    "uncertain",
  );
  expect((await processOperationsNotice(db, job, config, send)).status).toBe(
    "uncertain",
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    (
      await pg.query<{ state: string }>(
        "SELECT state FROM notification_deliveries",
      )
    ).rows[0].state,
  ).toBe("uncertain");
});
it("defers the same job during quiet hours without consuming retries or sending", async () => {
  await saveOperationsPreferences(db, actor, {
    expectedVersion: 0,
    preferences: {
      ...defaultPreferences,
      notificationsEnabled: true,
      quietHoursEnabled: true,
    },
  });
  const send = vi.fn();
  const result = await processOperationsNotice(
    db,
    job,
    config,
    send,
    "2026-10-06T23:00:00Z",
  );
  expect(result.status).toBe("deferred");
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await pg.query<{ lease_token: string | null }>(
        "SELECT lease_token FROM outbox WHERE id=$1",
        [job.id],
      )
    ).rows[0].lease_token,
  ).toBeNull();
});
it("deduplicates daily digest queue identities and preserves no-payment authority", async () => {
  await saveOperationsPreferences(db, actor, {
    expectedVersion: 0,
    preferences: { ...defaultPreferences, notificationsEnabled: true },
  });
  const invoice = crypto.randomUUID();
  await pg.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'invoice',$2,$3,$4)",
    [
      org,
      invoice,
      JSON.stringify({
        amount: "1000000",
        currency: "USDC",
        reference: "INV",
        engagementId: crypto.randomUUID(),
        obligationId: "period",
        dueDate: "2026-10-05",
        status: "received",
      }),
      actor.wallet,
    ],
  );
  expect(
    (await queueOperationsDigest(db, org, "2026-10-06T12:00:00Z")).enqueued,
  ).toBe(true);
  expect(
    (await queueOperationsDigest(db, org, "2026-10-06T14:00:00Z")).enqueued,
  ).toBe(false);
  expect((await pg.query("SELECT * FROM payment_intents")).rows).toHaveLength(
    0,
  );
});
