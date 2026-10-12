import { expect, test } from "@playwright/test";

test("custom demo dates and currencies stay exact without invented approved evidence", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/workspace/obligations");
  await page.getByRole("button", { name: "Add sample invoice" }).click();
  await page.getByLabel("Vendor name").fill("Judge date case");
  await page.getByLabel("Invoice reference").fill("DATE-2027");
  await page.getByLabel("Amount (USD)").fill("25.50");
  await page.getByLabel("Due date").fill("2027-03-19");
  await page.getByRole("button", { name: "Add to review queue" }).click();
  const row = page.getByRole("row").filter({ hasText: "DATE-2027" });
  await expect(row.locator("td").nth(2)).toContainText("2027");
  await expect(row.locator("td").nth(1)).toContainText("USD");
  await expect(row).not.toContainText("USDC");
  await row.locator(".vendor-cell").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Source required");
  await expect(dialog).not.toContainText("Fictional agreement · version 2");
  await expect(
    dialog.getByRole("button", { name: "Review sample acceptance" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Download illustrative decision record",
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/workspace/plan");
  const plan = page.locator(".plan-row").filter({ hasText: "Judge date case" });
  await expect(plan).toContainText("MAR");
  await expect(plan).toContainText("2027");
  await expect(plan).toContainText("HOLD");
  expect(apiRequests).toEqual([]);
});

test("a judge can inspect source text and recorded proposals without a model call", async ({
  page,
}) => {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Review case", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByText("Inspect synthetic source text", { exact: true })
    .click();
  await expect(dialog).toContainText("Activity is evidence of progress");
  await expect(dialog).toContainText("Production verifier result: ASK");
  await dialog
    .getByText("Recorded model proposal fixture", { exact: true })
    .click();
  await expect(dialog).toContainText("No model was executed");
  await expect(dialog).toContainText("Missing question");
  await expect(
    dialog.getByRole("link", { name: /Open cited source/ }).first(),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review sample acceptance" })
    .click();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Record sample acceptance" })
    .click();
  await expect(dialog).toContainText("Production verifier result: PAY");
  await expect(dialog).toContainText("Execution authority: none");
  await expect(dialog).toContainText("Invoice version: 2");
});
