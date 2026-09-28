import { test, expect } from "@playwright/test";
import { guides } from "../../src/lib/content/guides";
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
  for (const { slug: path } of guides) {
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

test("interactive landing supports keyboard review and clear availability", async ({
  page,
}) => {
  await page.goto("/");
  const review = page.getByRole("tab", { name: "02 · Review" });
  await expect(review).toHaveAttribute("aria-selected", "true");
  await review.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "03 · Record" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tabpanel")).toContainText(
    "Eligibility alone does not authorize",
  );
  await page
    .locator("summary")
    .filter({ hasText: "What is available today?" })
    .click();
  await expect(page.locator("details[open]")).toContainText(
    "Live payments and funded protection are not available",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});

test("handbook search, anchors, raw Markdown and LLM corpus agree", async ({
  page,
  request,
}) => {
  await page.goto("/docs");
  await page
    .getByRole("searchbox", { name: "Search documentation" })
    .fill("idempotency");
  await expect(
    page.locator(".handbook-search-results a").first(),
  ).toBeVisible();
  await page.locator(".handbook-search-results a").first().click();
  await expect(page.locator("article h1")).toBeVisible();
  await page.goto("/docs/verification");
  const markdown = await request.get("/docs/raw/verification");
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(await markdown.text()).toContain("# ");
  const index = await request.get("/llms.txt");
  expect(await index.text()).toContain("/docs/raw/verification");
  const full = await request.get("/llms-full.txt");
  expect(await full.text()).toContain((await markdown.text()).trim());
  expect((await request.get("/docs/raw/not-a-guide")).status()).toBe(404);
  const ids = await page
    .locator("article [id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  for (const anchor of await page
    .locator('.handbook-outline a[href^="#"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")!.slice(1))))
    expect(ids).toContain(anchor);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});
