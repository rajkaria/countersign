import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.BASE_URL || "http://localhost:3100";
try {
  await page.goto(base + "/workspace");
  await page.getByRole("button", { name: "Review case", exact: true }).click();
  await page.getByRole("button", { name: "Review sample acceptance" }).click();
  const accept = page.getByRole("button", { name: "Record sample acceptance" });
  assert.equal(await accept.isDisabled(), true);
  await page.getByRole("checkbox").check();
  await accept.click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  const northstar = page
    .getByRole("row")
    .filter({ hasText: "NS-1042 ·" })
    .first();
  await northstar.getByText("Ready to prepare").waitFor();
  await page.getByRole("button", { name: "Add sample invoice" }).click();
  await page.getByLabel("Vendor name").fill("Example Studio");
  await page.getByLabel("Invoice reference").fill("TEST-001");
  await page.getByLabel("Amount (USD)").fill("345.00");
  await page.getByRole("button", { name: "Add to review queue" }).click();
  await page.getByRole("row").filter({ hasText: "TEST-001" }).waitFor();
  await page
    .getByRole("textbox", { name: "Search invoices" })
    .fill("no such vendor");
  await page.getByRole("heading", { name: "No invoices match" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  assert.match((await downloaded).suggestedFilename(), /\.csv$/);
  await page.goto(base + "/workspace/recovery");
  await page
    .getByRole("button", { name: "Run safety fixture" })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Fail closed. Keep the evidence." })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/workspace");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Payment plan", exact: true }).click();
  await page
    .getByRole("heading", { name: "Payment plan", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.goto(base + "/");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  console.log(
    "PASS: acceptance gate, decision persistence, sample intake, filtering, CSV export, recovery dialog, mobile navigation, responsive overflow.",
  );
} finally {
  await browser.close();
}
