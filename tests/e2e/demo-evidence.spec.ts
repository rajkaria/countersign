import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("the landing demo starts the wallet-free guided walkthrough", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("link", { name: /Explore the demo/i }).first();
  await expect(start).toHaveAttribute("href", "/review", { timeout: 5000 });
  await start.click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("link", { name: "See recorded evidence", exact: true })).toHaveAttribute("href", "#recorded-evidence");
});

test("recorded evidence downloads an inspectable summary without invoking a provider or payment", async ({ page }) => {
  const effects: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || /deepseek|openai|circle|rpc\.testnet/.test(url.hostname)) effects.push(request.url());
  });
  await page.goto("/review");
  const evidence = page.getByRole("region", { name: "Recorded demonstration evidence", exact: true });
  await expect(evidence).toBeVisible({ timeout: 5000 });
  await expect(evidence).toContainText("Recorded DeepSeek request");
  await expect(evidence).toContainText("ASK → ASK");
  await expect(evidence).toContainText("separate manual test");
  await evidence.getByText("Inspect recorded summary", { exact: true }).click();
  await expect(evidence.getByLabel("Recorded evidence summary")).toContainText('"humanBenefitMeasured": false');
  const pending = page.waitForEvent("download");
  await evidence.getByRole("button", { name: "Download recorded summary", exact: true }).click();
  const download = await pending;
  const raw = await readFile((await download.path())!, "utf8"), data = JSON.parse(raw);
  expect(data.classification).toBe("synthetic-recorded-summary");
  expect(data.authority).toBe("none");
  expect(data.model.rulesAction).toBe(data.model.proposalAction);
  expect(data.model.humanBenefitMeasured).toBe(false);
  expect(data.model.responseSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(data.transfer.chainId).toBe(5042002);
  expect(data.transfer.kind).toBe("manual-local-wallet-test");
  expect(data.transfer.invoicePayment).toBe(false);
  expect(data.transfer.circleAgentWallet).toBe(false);
  expect(raw).not.toMatch(/\/Users\/|MODEL_API_KEY|privateKey|api[_-]?key|session=/i);
  await expect(evidence.getByRole("link", { name: "View finalized Arc transfer", exact: true })).toHaveAttribute("href", `https://explorer.testnet.arc.io/tx/${data.transfer.transactionHash}`);
  expect(effects).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
