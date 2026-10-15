import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("unauthenticated reviewer can reproduce cases and download exact fixture evidence", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/organizations|openai|circle-fin/.test(r.url()))
      privateRequests.push(r.url());
  });
  await page.goto("/review");
  await expect(
    page.getByText("SYNTHETIC DEMONSTRATION", { exact: true }),
  ).toBeVisible();
  const decision = page.locator(".review-decision");
  await expect(decision.getByRole("heading", { level: 3 })).toHaveText("ASK");
  await page
    .getByLabel("Fictional answer", { exact: true })
    .selectOption("accept");
  await page
    .getByLabel(
      "I am submitting a fictional answer; no real identity or payment authority is authenticated.",
    )
    .check();
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await expect(decision.getByRole("heading", { level: 3 })).toHaveText("PAY");
  await page.getByRole("button", { name: /02 Corrections/ }).click();
  await expect(decision.getByRole("heading", { level: 3 })).toHaveText("ASK");
  await page
    .getByRole("button", { name: "Accept synthetic version 2" })
    .click();
  await expect(decision.getByRole("heading", { level: 3 })).toHaveText("PAY");
  await page.getByRole("button", { name: /03 Pay the remainder/ }).click();
  await page
    .getByRole("button", { name: "Record synthetic first half" })
    .click();
  await expect(page.locator(".review-flow")).toContainText("400 USDC");
  await page.getByRole("button", { name: /04 Renaming/ }).click();
  await page
    .getByRole("button", { name: "Rename the synthetic invoice" })
    .click();
  await expect(decision.getByRole("heading", { level: 3 })).toHaveText("HOLD");
  await page.getByRole("button", { name: /05 A timeout/ }).click();
  await page.getByRole("button", { name: "Run synthetic timeout" }).click();
  await expect(page.getByLabel("Execution reducer result")).toContainText(
    "Repeat submission rejected",
  );
  await page.getByRole("button", { name: /Inspect exact/ }).click();
  await expect(page.getByLabel("Reproducible synthetic walkthrough").locator(".review-source")).toContainText(
    "verifyObligation",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download fixture trace" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe(
    "countersign-synthetic-uncertain.json",
  );
  expect(privateRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});

test("frozen clarification needs an explicit current-authority answer and exposes a strong rules comparison", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/organizations|openai|circle-fin/.test(request.url()))
      external.push(request.url());
  });
  await page.goto("/review");
  const comparison = page.getByLabel("Frozen clarification comparison");
  const frozen = await comparison
    .locator(".review-context-commitment")
    .innerText();
  await expect(comparison.getByLabel("Strong rules baseline")).toContainText(
    "owner-1",
  );
  await expect(
    comparison.getByLabel("Recorded clarification proposal"),
  ).toContainText("keyboard navigation");
  await expect(comparison).toContainText("No model was executed");
  await expect(
    page.getByRole("button", { name: "Submit synthetic answer" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "I am submitting a fictional answer; no real identity or payment authority is authenticated.",
    )
    .check();
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await expect(comparison.getByRole("status")).toContainText("ASK → ASK");
  await page
    .getByLabel("Fictional answer", { exact: true })
    .selectOption("accept");
  await page.getByLabel("Fictional responder").selectOption("vendor-1");
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await expect(comparison.getByRole("status")).toContainText("ASK → ASK");
  await page.getByLabel("Fictional responder").selectOption("owner-1");
  await page
    .getByLabel("Answer applies to agreement version")
    .selectOption("2");
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await expect(comparison.getByRole("status")).toContainText("ASK → ASK");
  await page
    .getByLabel("Answer applies to agreement version")
    .selectOption("1");
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await expect(comparison.getByRole("status")).toContainText("ASK → PAY");
  await expect(comparison.getByRole("status")).toContainText(
    "Execution: disabled",
  );
  await expect(comparison.locator(".review-context-commitment")).toHaveText(
    frozen,
  );
  await page
    .getByLabel("Answer applies to agreement version")
    .selectOption("2");
  await expect(comparison.getByRole("status")).toHaveCount(0);
  await expect(
    page.locator(".review-decision").getByRole("heading", { level: 3 }),
  ).toHaveText("ASK");
  await expect(comparison.locator(".review-context-commitment")).toHaveText(
    frozen,
  );
  await page
    .getByLabel("Answer applies to agreement version")
    .selectOption("1");
  await page.getByRole("button", { name: "Submit synthetic answer" }).click();
  await page
    .getByRole("button", { name: "Inspect cited question sources" })
    .click();
  await expect(comparison).toContainText("No statement from owner-1");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download clarification trace" })
    .click();
  const download = await event;
  expect(download.suggestedFilename()).toBe(
    "countersign-synthetic-clarification.json",
  );
  const artifact = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(artifact.frozen.contextCommitment).toBe(frozen);
  expect(artifact.rules.decision.action).toBe("ASK");
  expect(artifact.after.decision.action).toBe("PAY");
  expect(artifact.after.decision.executable).toBe(false);
  expect(artifact.answer.actorId).toBe("owner-1");
  expect(artifact.agentFixture.modelExecuted).toBe(false);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
});
