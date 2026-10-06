import { test, expect } from "@playwright/test";
test("isolated operations desk supports exception work, reminder preferences and labeled exports", async ({
  page,
}) => {
  const realCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/organizations/")) realCalls.push(r.url());
  });
  await page.goto("/workspace/operations");
  await expect(
    page.getByRole("heading", { name: "Every obligation. A clear next step." }),
  ).toBeVisible();
  await expect(page.locator(".sandbox-banner")).toBeVisible();
  await page.getByRole("button", { name: "Assign or resolve" }).click();
  await page
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("urgent");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("resolved");
  await page
    .getByLabel("Resolution and evidence")
    .fill(
      "Sample customer acceptance received and reviewed; request fresh verification.",
    );
  await page.getByRole("button", { name: "Save case" }).click();
  await expect(page.locator(".ops-notice")).toContainText(
    "does not authorize payment",
  );
  await page
    .getByText("Notification & escalation preferences", { exact: true })
    .click();
  await page.getByLabel("Timezone", { exact: true }).fill("Asia/Kolkata");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".ops-notice")).toContainText(
    "No notification was sent",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await download).suggestedFilename()).toBe(
    "countersign-synthetic-close.json",
  );
  expect(realCalls).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("new operating and access APIs retain the anonymous tenant boundary", async ({
  request,
}) => {
  const prefix = "/api/organizations/11111111-1111-4111-8111-111111111111";
  for (const suffix of [
    "/operations",
    "/activation",
    "/intake-keys",
    "/vendor-links",
    "/invoices/22222222-2222-4222-8222-222222222222/balance",
    "/payments/22222222-2222-4222-8222-222222222222",
  ]) {
    const result = await request.get(prefix + suffix);
    expect([401, 503]).toContain(result.status());
    expect(await result.text()).not.toMatch(
      /"records"|"token_hash"|"permit"|"invoices"/,
    );
  }
});
