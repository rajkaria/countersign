import { test, expect } from "@playwright/test";
test("landing, docs, private auth and synthetic workspace remain distinctly labeled", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Explore the demo/i }).first(),
  ).toBeVisible();
  await page.goto("/docs/security");
  await expect(
    page.getByRole("heading", { name: "Authority stays deliberately narrow" }),
  ).toBeVisible();
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /Sign in with Ethereum/ }),
  ).toBeVisible();
  await page.goto("/workspace");
  await expect(page.locator(".sandbox-banner")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
});
test("every handbook route renders and unknown routes fail cleanly", async ({
  page,
}) => {
  for (const path of [
    "getting-started",
    "agreements",
    "payments",
    "security",
    "protection",
    "recovery",
    "integrations",
    "api",
    "receipts",
    "deployment",
    "evaluation",
    "release-status",
  ]) {
    const response = await page.goto(`/docs/${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("article h1")).toBeVisible();
  }
  expect((await page.goto("/docs/not-a-guide"))?.status()).toBe(404);
});
test("health is public but private workspace data cannot be retrieved anonymously", async ({
  request,
}) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  const response = await request.get(
    "/api/organizations/11111111-1111-4111-8111-111111111111/snapshot",
  );
  expect([401, 503]).toContain(response.status());
  expect(await response.text()).not.toContain("records");
});
