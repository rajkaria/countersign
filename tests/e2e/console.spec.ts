// Synthetic browser transport fixtures; these cases do not claim live tenant or payment activation.
import { test, expect, type Page } from "@playwright/test";
const org = "11111111-1111-4111-8111-111111111111",
  otherOrg = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333",
  agreementId = "44444444-4444-4444-8444-444444444444",
  invoiceId = "55555555-5555-4555-8555-555555555555";
const wallet = `0x${"11".repeat(20)}`,
  destination = `0x${"22".repeat(20)}`;
const originalRecords = [
  {
    id: vendorId,
    kind: "vendor",
    version: 2,
    body: {
      name: "Scoped contractor",
      reference: "V-1",
      destination,
      chainId: 5042002,
      destinationVersion: 2,
      verified: true,
      verificationNote: "Confirmed over established contact",
    },
  },
  {
    id: agreementId,
    kind: "engagement",
    version: 3,
    body: {
      vendorId,
      title: "Engineering hours",
      billing: "hourly",
      currency: "USDC",
      amount: "100000000",
      hourlyRate: "10000000",
      maximumQuantity: "10",
      ceiling: "1000000000",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2027-01-01",
      acceptanceRequired: true,
      acceptors: [wallet],
      partialAllowed: true,
      minimumPartial: "1000000",
      acceptanceMaxAgeSeconds: 3600,
      mode: "prepare",
      approved: true,
    },
  },
  {
    id: invoiceId,
    kind: "invoice",
    version: 1,
    body: {
      vendorId,
      engagementId: agreementId,
      engagementVersion: 2,
      destinationVersion: 1,
      destinationChainId: 5042002,
      reference: "INV-UTILITY",
      amount: "100000000",
      currency: "USDC",
      quantity: "10",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      dueDate: "2026-10-10",
      destination,
      description: "Engineering deliverable",
      status: "received",
      paidAmount: "0",
    },
  },
];
async function mockedWorkspace(
  page: Page,
  deferred?: {
    wait: Promise<void>;
    started: () => void;
    completed: () => void;
  },
) {
  const records = structuredClone(originalRecords);
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let attempts = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (path === "/api/auth/me")
      return send({
        wallet,
        organizations: [
          { id: org, name: "Workspace A", role: "owner" },
          { id: otherOrg, name: "Workspace B", role: "owner" },
        ],
      });
    if (path === "/api/auth/logout") return route.fulfill({ status: 204 });
    if (path.endsWith("/snapshot")) {
      if (path.includes(org) && deferred) {
        deferred.started();
        await deferred.wait;
      }
      await send({
        records: path.includes(otherOrg) ? [] : records,
        events: [],
        payments: [],
        role: "owner",
        executionEnabled: false,
      });
      if (path.includes(org) && deferred) deferred.completed();
      return;
    }
    if (path.endsWith("/documents") || path.endsWith("/intake-events"))
      return send([]);
    if (request.method() === "PUT" && path.includes("/records/")) {
      const body = request.postDataJSON();
      writes.push({ path, body });
      const entry = records.find((record) => path.endsWith(record.id));
      if (entry) {
        entry.body = { ...entry.body, ...body.body };
        entry.version += 1;
      }
      return send(entry);
    }
    if (path.endsWith("/balance"))
      return send({
        invoiced: "100000000",
        settled: "0",
        reserved: "25000000",
        remaining: "75000000",
        currency: "USDC",
        invoiceVersion: records.find((record) => record.id === invoiceId)!
          .version,
        overallocated: false,
      });
    if (path.endsWith("/review"))
      return send({
        decision: {
          action: "HOLD",
          reason: "Delivery acceptance required",
          findings: [],
          nextCheck: "Confirm delivery acceptance.",
        },
        balance: {
          invoiced: "100000000",
          settled: "0",
          reserved: "0",
          remaining: "100000000",
        },
      });
    if (path.endsWith("/prepare")) {
      const body = request.postDataJSON();
      writes.push({ path, body });
      attempts += 1;
      if (attempts === 1)
        return send(
          {
            error: {
              message: "Provider unavailable. Retry the original operation.",
            },
          },
          503,
        );
      return send({
        id: "prepared-payment",
        state: "prepared",
        permit: { amount: body.requestedAmount },
      });
    }
    if (
      request.method() === "GET" &&
      ["members", "destination-changes", "vendor-links", "intake-keys"].some(
        (resource) => path.endsWith(`/${resource}`),
      )
    )
      return send([]);
    if (path.endsWith("/intake-keys") && request.method() === "POST")
      return send({
        token: "synthetic-test-token",
        endpoint: "/api/intake",
        warning: "Shown only once; cannot approve payments.",
      });
    return send(
      { error: { message: `Unexpected mock endpoint: ${path}` } },
      404,
    );
  });
  return { writes, getRecords: () => records };
}

test("console preserves versioned hourly terms and exact retry identities", async ({
  page,
}) => {
  const mock = await mockedWorkspace(page);
  await page.goto("/console");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agreements", exact: true }).click();
  await page.getByRole("button", { name: /Engineering hours hourly/ }).click();
  await page.getByRole("button", { name: "Create reviewed amendment" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Billing model")).toHaveValue("hourly");
  await expect(
    dialog.getByLabel("Rate per whole hour (USDC)", { exact: true }),
  ).toHaveValue("10.000000");
  await expect(
    dialog.getByLabel("Agreement permits partial payment."),
  ).toBeChecked();
  await expect(
    dialog.getByRole("combobox", { name: "Mode", exact: true }),
  ).toHaveValue("prepare");
  await expect(
    dialog.getByLabel(/Authorized customer acceptor wallets/),
  ).toHaveValue(wallet);
  await dialog
    .getByLabel("I am authorized to activate these exact reviewed terms.")
    .check();
  await dialog.getByRole("button", { name: "Save to workspace" }).click();
  await expect(dialog).not.toBeVisible();
  const amendment = mock.writes.find((write) =>
    write.path.includes("/records/engagement/"),
  )!.body;
  expect(amendment.expectedVersion).toBe(3);
  expect(amendment.body).toMatchObject({
    hourlyRate: "10000000",
    maximumQuantity: "10",
    acceptanceRequired: true,
    partialAllowed: true,
    acceptors: [wallet],
    mode: "prepare",
    currency: "USDC",
  });
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await page
    .getByRole("button", { name: /INV-UTILITY Engineering deliverable/ })
    .click();
  await page.getByRole("button", { name: "Create invoice correction" }).click();
  await expect(dialog.getByLabel("Billing period starts")).toHaveAttribute(
    "readonly",
    "",
  );
  await dialog.getByLabel(/I reviewed the current agreement amendment/).check();
  await dialog
    .getByLabel(
      /I independently reviewed the current registered vendor destination/,
    )
    .check();
  await dialog.getByRole("button", { name: "Save to workspace" }).click();
  await expect(dialog).not.toBeVisible();
  const correction = mock.writes.find((write) =>
    write.path.includes("/records/invoice/"),
  )!.body;
  expect(correction.expectedVersion).toBe(1);
  expect(correction.body).toMatchObject({
    engagementVersion: 4,
    destinationVersion: 2,
    destinationChainId: 5042002,
    quantity: "10",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
  await page
    .getByRole("button", { name: /INV-UTILITY Engineering deliverable/ })
    .click();
  await page.getByRole("button", { name: "Prepare exact amount" }).click();
  await expect(dialog.getByLabel("Exact proposal amount (USDC)")).toHaveValue(
    "75.000000",
  );
  await dialog.getByLabel("Exact proposal amount (USDC)").fill("25.000001");
  await dialog.getByRole("button", { name: "Prepare reviewed amount" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Retry the original operation",
  );
  await expect(dialog.getByLabel("Exact proposal amount (USDC)")).toHaveValue(
    "25.000001",
  );
  await dialog.getByRole("button", { name: "Prepare reviewed amount" }).click();
  await expect(dialog).not.toBeVisible();
  const proposals = mock.writes.filter((write) =>
    write.path.endsWith("/prepare"),
  );
  expect(proposals).toHaveLength(2);
  expect(proposals[0].body).toEqual(proposals[1].body);
  expect(proposals[0].body.requestedAmount).toBe("25000001");
});

test("workspace switch clears private records and one-time keys; 204 logout succeeds", async ({
  page,
}) => {
  await mockedWorkspace(page);
  await page.goto("/console");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Forwarded intake", exact: true })
    .click();
  await page.getByRole("button", { name: "Create forwarding key" }).click();
  const secret = page.getByRole("region", { name: "One-time private access" });
  await expect(secret.getByRole("textbox")).toHaveValue("synthetic-test-token");
  await page.getByLabel("Organization", { exact: true }).selectOption(otherOrg);
  await expect(secret).not.toBeVisible();
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await expect(
    page.getByText("INV-UTILITY", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No records yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("a late snapshot from the previous workspace cannot replace the current tenant", async ({
  page,
}) => {
  let release!: () => void,
    markStarted!: () => void,
    markCompleted!: () => void;
  const wait = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      markStarted = resolve;
    }),
    completed = new Promise<void>((resolve) => {
      markCompleted = resolve;
    });
  await mockedWorkspace(page, {
    wait,
    started: markStarted,
    completed: markCompleted,
  });
  await page.goto("/console");
  await started;
  await page.getByLabel("Organization", { exact: true }).selectOption(otherOrg);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  release();
  await completed;
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await expect(page.getByLabel("Organization", { exact: true })).toHaveValue(
    otherOrg,
  );
  await expect(
    page.getByRole("heading", { name: "No records yet" }),
  ).toBeVisible();
  await expect(
    page.getByText("INV-UTILITY", { exact: false }),
  ).not.toBeVisible();
});

test("synthetic invoice extraction displays proposal-only provenance and clears on tenant switch", async ({
  page,
}) => {
  await mockedWorkspace(page);
  const documentId = "66666666-6666-4666-8666-666666666666",
    sha256 = "a".repeat(64),
    commitment = "synthetic-original-document-commitment";
  const extractionRequests: unknown[] = [],
    recordMutations: string[] = [];
  await page.route("**/api/organizations/*/documents", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        new URL(route.request().url()).pathname.includes(otherOrg)
          ? []
          : [
              {
                id: documentId,
                filename: "synthetic-original-invoice.txt",
                mime: "text/plain",
              },
            ],
      ),
    }),
  );
  await page.route("**/api/organizations/*/extract", async (route) => {
    extractionRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        documentId,
        kind: "invoice",
        model: "synthetic-extraction-model",
        status: "unapproved_suggestion",
        suggestion: {
          vendorName: "Synthetic source vendor",
          reference: "INV-SOURCE-FIXTURE",
          amountText: "25.000001",
          currency: "USDC",
          periodStart: "2026-09-01",
          periodEnd: "2026-09-30",
          dueDate: "2026-10-10",
          quantityText: "2.5",
          destinationText: destination,
          description: "Synthetic invoice extraction fixture",
          sourceLocations: ["Original line 3"],
          uncertainties: ["Vendor identity requires independent confirmation"],
        },
        provenance: {
          provider: "openai",
          providerResponseId: "synthetic-response-id",
          model: "synthetic-extraction-model",
          promptVersion: "countersign-invoice-extraction-v1",
          observedAt: "2026-10-06T00:00:00.000Z",
          authority: "proposal-only",
          source: {
            documentId,
            filename: "synthetic-original-invoice.txt",
            mime: "text/plain",
            bytes: 128,
            sha256,
            commitment,
          },
        },
      }),
    });
  });
  await page.route("**/api/organizations/*/records/**", async (route) => {
    if (["POST", "PUT"].includes(route.request().method())) {
      recordMutations.push(route.request().url());
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Synthetic extraction must not create records." },
        }),
      });
    } else await route.fallback();
  });
  await page.goto("/console");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Team & settings", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Extract fields from", exact: true })
    .selectOption("invoice");
  await page
    .getByRole("button", { name: "Extract suggestions", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Unapproved suggestions only" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Review against the original",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("INV-SOURCE-FIXTURE", { exact: false }),
  ).toBeVisible();
  await page
    .getByText("Source and extraction provenance", { exact: true })
    .click();
  const provenance = page.locator("pre").filter({ hasText: "proposal-only" });
  await expect(provenance).toContainText(sha256);
  await expect(provenance).toContainText(commitment);
  await expect(provenance).toContainText(documentId);
  expect(extractionRequests).toEqual([{ documentId, kind: "invoice" }]);
  expect(recordMutations).toEqual([]);
  await page.getByLabel("Organization", { exact: true }).selectOption(otherOrg);
  await expect(
    page.getByRole("heading", {
      name: "Review against the original",
      exact: true,
    }),
  ).not.toBeVisible();
  await expect(
    page.getByText("INV-SOURCE-FIXTURE", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.locator("pre").filter({ hasText: commitment }),
  ).not.toBeVisible();
});
