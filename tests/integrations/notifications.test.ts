import { it, expect } from "vitest";
import { notifyOperator } from "../../src/lib/integrations/notifications";
const organizationId = "11111111-1111-4111-8111-111111111111";
const event = {
  organizationId,
  eventId: "22222222-2222-4222-8222-222222222222",
  kind: "exception" as const,
  summary: "Acceptance required",
};
it("does not contact notification provider unless explicitly configured for the tenant", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response("{}");
  };
  expect(
    (
      await notifyOperator(
        event,
        {
          enabled: false,
          organizationId,
          botToken: "",
          chatId: "",
          appOrigin: "https://example.com",
        },
        fetcher,
      )
    ).sent,
  ).toBe(false);
  await expect(
    notifyOperator(
      event,
      {
        enabled: true,
        organizationId: "other",
        botToken: "secret",
        chatId: "channel",
        appOrigin: "https://example.com",
      },
      fetcher,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
