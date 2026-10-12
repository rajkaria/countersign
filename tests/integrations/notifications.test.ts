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
it("links notice reviews to the configured tenant and exact invoice context", async () => {
  let payload: { text: string } | undefined;
  await notifyOperator(
    {
      ...event,
      reviews: [
        {
          label: "INV-001",
          view: "invoices",
          invoiceId: "33333333-3333-4333-8333-333333333333",
          caseId: "44444444-4444-4444-8444-444444444444",
        },
      ],
    },
    {
      enabled: true,
      organizationId,
      botToken: "fixture",
      chatId: "fixture",
      appOrigin: "https://example.com",
    },
    async (_url, request) => {
      payload = JSON.parse(String(request?.body));
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 12 } }),
      );
    },
  );
  expect(payload!.text).toContain(
    `https://example.com/console?org=${organizationId}&view=invoices&invoice=33333333-3333-4333-8333-333333333333&case=44444444-4444-4444-8444-444444444444`,
  );
  expect(payload!.text).not.toContain("/console\n");
});
it("rejects forged tenant parameters and mismatched review contexts before provider delivery", async () => {
  let calls = 0;
  const configured = {
    enabled: true,
    organizationId,
    botToken: "fixture",
    chatId: "fixture",
    appOrigin: "https://example.com",
  };
  const fetcher = async () => {
    calls++;
    return new Response("{}");
  };
  for (const review of [
    {
      label: "Forged",
      view: "invoices",
      invoiceId: "33333333-3333-4333-8333-333333333333",
      organizationId: "44444444-4444-4444-8444-444444444444",
    },
    {
      label: "Malformed",
      view: "invoices",
      invoiceId: "https://untrusted.example",
    },
    {
      label: "Wrong context",
      view: "operations",
      invoiceId: "33333333-3333-4333-8333-333333333333",
    },
  ])
    await expect(
      notifyOperator(
        { ...event, reviews: [review] } as Parameters<typeof notifyOperator>[0],
        configured,
        fetcher,
      ),
    ).rejects.toThrow();
  expect(calls).toBe(0);
});
