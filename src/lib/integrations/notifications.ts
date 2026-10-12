import { z } from "zod";
import { boundedJson, type Fetcher } from "./http";
import { consoleReviewHref, noticeReviewsSchema } from "../console-review";
const notice = z
  .object({
    organizationId: z.uuid(),
    eventId: z.uuid(),
    kind: z.enum([
      "exception",
      "overdue",
      "stuck_payment",
      "coverage_capacity",
    ]),
    summary: z.string().min(1).max(500),
    reviews: noticeReviewsSchema.optional(),
  })
  .strict();
/** Explicit operator-configured notification adapter. It never signs or approves a payment. */
export async function notifyOperator(
  input: z.infer<typeof notice>,
  config: {
    enabled: boolean;
    organizationId: string;
    botToken: string;
    chatId: string;
    appOrigin: string;
  },
  fetcher: Fetcher = fetch,
) {
  const event = notice.parse(input);
  if (!config.enabled) return { sent: false, reason: "disabled" };
  if (
    event.organizationId !== config.organizationId ||
    !config.botToken ||
    !config.chatId
  )
    throw new Error("Notification target is not configured for this workspace");
  const origin = new URL(config.appOrigin);
  if (origin.protocol !== "https:")
    throw new Error("Notification links require HTTPS");
  const links = event.reviews?.length
    ? event.reviews
        .map(
          ({ label, ...review }) =>
            `Review ${label}: ${origin.origin}${consoleReviewHref(event.organizationId, review)}`,
        )
        .join("\n")
    : `Review in your authenticated workspace: ${origin.origin}${consoleReviewHref(event.organizationId, { view: "operations" })}`;
  const response = await fetcher(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: `Countersign: ${event.kind.replaceAll("_", " ")}\n${event.summary}\n\n${links}\nEvent ${event.eventId}`,
        link_preview_options: { is_disabled: true },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = z
    .object({
      ok: z.boolean(),
      result: z.object({ message_id: z.number() }).optional(),
    })
    .parse(await boundedJson(response));
  if (!result.ok || !result.result)
    throw new Error("Notification provider did not confirm delivery");
  return { sent: true, messageId: result.result.message_id };
}
