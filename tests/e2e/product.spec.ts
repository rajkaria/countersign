import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { guides, siteOrigin } from "../../src/lib/content/guides";
const { version: expectedVersion } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
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
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    version: expectedVersion,
    executionEnabled: false,
    mainnetEnabled: false,
    executionScope: "arc-testnet-only",
  });
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

test("canonical metadata, structured data and public discovery use the same origin", async ({
  page,
  request,
}) => {
  for (const route of ["/", "/review", "/docs/verification"]) {
    await page.goto(route);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${siteOrigin}${route === "/" ? "" : route}`,
    );
  }

  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    `${siteOrigin}/docs/verification`,
  );
  const article = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  );
  expect(article.url).toBe(`${siteOrigin}/docs/verification`);
  expect(article.isPartOf.url).toBe(`${siteOrigin}/docs`);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain(`<loc>${siteOrigin}/docs/verification</loc>`);
  expect(sitemapText).toContain(`<loc>${siteOrigin}/review</loc>`);
  expect(await (await request.get("/robots.txt")).text()).toContain(
    `Sitemap: ${siteOrigin}/sitemap.xml`,
  );
  expect(await (await request.get("/llms.txt")).text()).toContain(
    `${siteOrigin}/docs/raw/verification`,
  );
  expect(await (await request.get("/llms-full.txt")).text()).toContain(
    `Source: ${siteOrigin}/docs/verification\nMarkdown: ${siteOrigin}/docs/raw/verification\n`,
  );
});
