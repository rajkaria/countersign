import { test, expect } from "@playwright/test";

test("handbook home provides task paths and a complete guide directory", async ({
  page,
}) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Understand the payment.",
  );
  await page.getByRole("link", { name: /Browse all .* guides/ }).click();
  await expect(page.locator("#guide-directory")).toBeInViewport();
  await page
    .locator(".docs-guide-group")
    .getByRole("link", { name: /A payment, end to end/ })
    .click();
  await expect(page.locator("article h1")).toHaveText("A payment, end to end");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/docs\/payment-lifecycle$/,
  );
});

test("decision teaching examples explain outcomes without creating provider requests", async ({
  page,
}) => {
  const effects: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
      effects.push(request.url());
  });
  await page.goto("/docs/verification");
  const diagram = page.getByRole("region", {
    name: "Illustrative payment decision",
  });
  await expect(diagram.getByRole("status")).toContainText("ASK");
  await diagram.getByRole("button", { name: "Terms changed" }).click();
  await expect(diagram.getByRole("status")).toContainText("HOLD");
  await diagram.getByRole("button", { name: "Checks pass" }).click();
  await expect(diagram.getByRole("status")).toContainText(
    "In Observe mode this remains analysis",
  );
  await expect(
    diagram.getByRole("button", { name: "Checks pass" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(effects).toEqual([]);
});

test("handbook supports keyboard search and consistent guided demo entry", async ({
  page,
}) => {
  await page.goto("/docs");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await expect(search).toBeFocused();
  await search.fill("Resolve a finding");
  await expect(
    page.locator(".handbook-search-results a").first(),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator(".handbook-search-results a").first(),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("article h1")).toHaveText("Resolve a finding");
  await expect(page.locator(".handbook-demo")).toHaveAttribute(
    "href",
    "/review",
  );
});

test("navigation, article outline and diagrams fit small screens", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  if (isMobile) {
    await page.locator(".site-mobile-menu summary").click();
    await page
      .getByRole("navigation", { name: "Mobile main navigation" })
      .getByRole("link", { name: "Documentation" })
      .click();
  } else await page.goto("/docs");
  await expect(page.locator("article h1")).toBeVisible();
  for (const route of [
    "/docs",
    "/docs/getting-started",
    "/docs/payment-lifecycle",
    "/docs/troubleshooting",
  ]) {
    await page.goto(route);
    await expect(page.locator("article h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route,
    ).toBeTruthy();
  }
  if (isMobile) {
    await page.locator(".handbook-mobile-outline summary").click();
    await page
      .getByRole("navigation", { name: "Mobile page outline" })
      .getByRole("link", { name: "A request timed out" })
      .click();
    await expect(
      page.getByRole("heading", { name: "A request timed out" }),
    ).toBeInViewport();
  }
});

test("tablet headers and scrollable queues keep content inside the viewport", async ({
  page,
}) => {
  for (const width of [720, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/docs");
    const search = page.getByRole("searchbox", {
      name: "Search documentation",
    });
    await expect(search).toBeVisible();
    expect(
      await search.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    const searchBox = await search.boundingBox();
    const sidebar = await page.locator(".handbook-sidebar").boundingBox();
    expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(sidebar!.y);
    await page.goto("/workspace");
    await expect(page.locator(".workspace-content h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
    await expect(
      page.getByRole("region", { name: "Invoice queue", exact: true }),
    ).toHaveAttribute("tabindex", "0");
  }
});
