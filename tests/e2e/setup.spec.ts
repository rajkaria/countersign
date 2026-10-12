import { test, expect, type Page } from "@playwright/test";
import { demoOperations } from "../../src/lib/operations-demo";
const org = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const invoice = "22222222-2222-4222-8222-222222222222";
const agreement = "33333333-3333-4333-8333-333333333333";
const payment = "44444444-4444-4444-8444-444444444444";
const secondPayment = "55555555-5555-4555-8555-555555555555";
const fixtureRecords = [
  {
    id: invoice,
    kind: "invoice",
    version: 1,
    body: {
      reference: "INV-SETUP",
      amount: "1000000",
      currency: "USDC",
      engagementId: agreement,
    },
  },
  {
    id: agreement,
    kind: "engagement",
    version: 1,
    body: { title: "Fixture reviewed terms", currency: "USDC" },
  },
];
const fixturePayment = (id: string) => ({
  id,
  invoice_id: invoice,
  amount: "1000000",
  state: "uncertain",
  created_at: "2026-10-13T00:00:00Z",
  permit: { amount: "1000000" },
});
async function workspace(
  page: Page,
  options: { payments?: boolean; omitted?: boolean } = {},
) {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(route.request().url());
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/api/auth/me")
      return send({
        wallet: "0x1111111111111111111111111111111111111111",
        organizations: [{ id: org, name: "Fixture workspace", role: "owner" }],
      });
    if (path.endsWith("/snapshot"))
      return send({
        role: "owner",
        executionEnabled: false,
        events: [],
        payments:
          options.payments && !options.omitted
            ? [fixturePayment(payment), fixturePayment(secondPayment)]
            : [],
        records: options.omitted ? [] : fixtureRecords,
      });
    if (path.includes("/records/"))
      return send(fixtureRecords.find((record) => path.endsWith(record.id)));
    if (path.includes("/payments/"))
      return send(fixturePayment(path.split("/").at(-1)!));
    if (path.endsWith("/operations")) {
      const desk = demoOperations();
      desk.invoices = [];
      desk.cases = [];
      desk.digest.notices = [
        {
          kind: "due_soon",
          id: invoice,
          message: "Fixture invoice due for review.",
          review: { view: "invoices", invoiceId: invoice },
          href: `/console?org=${org}&view=invoices&invoice=${invoice}`,
          actionLabel: "Review linked invoice",
        },
      ];
      return send(desk);
    }
    if (path.endsWith("/documents") || path.endsWith("/intake-events"))
      return send([]);
    if (path.endsWith("/activation")) {
      const probe =
        new URL(route.request().url()).searchParams.get("probe") === "database";
      return send({
        schemaVersion: 1,
        checkedAt: "2026-10-13T00:00:00Z",
        profile: "web",
        probesRequested: probe,
        workspaceConfigured: true,
        executionConfigured: false,
        databaseVerified: probe,
        deploymentVerified: false,
        financialActivationVerified: false,
        limitations: [],
        checks: [
          {
            id: "database.configuration",
            status: "configured",
            requiredFor: "workspace",
            detail: "Private connection structure is configured.",
          },
          {
            id: "documents.key",
            status: "configured",
            requiredFor: "workspace",
            detail: "Document encryption configured.",
          },
          {
            id: "execution.switch",
            status: "disabled",
            requiredFor: "execution",
            detail: "Delegation disabled.",
          },
          {
            id: "owner.financial",
            status: "owner_action",
            requiredFor: "execution",
            detail: "Independent review and funding still required.",
          },
          ...(probe
            ? [
                {
                  id: "database.schema",
                  status: "verified",
                  requiredFor: "workspace",
                  detail: "Fixture schema readback.",
                },
              ]
            : []),
        ],
      });
    }
    if (path.endsWith("/balance"))
      return send({
        invoiced: "1000000",
        settled: "0",
        reserved: "0",
        remaining: "1000000",
        currency: "USDC",
        invoiceVersion: 1,
        overallocated: false,
      });
    return send(
      { error: { message: `Unexpected fixture endpoint: ${path}` } },
      404,
    );
  });
  return requests;
}

test("owner setup distinguishes configuration, database readback and financial approval", async ({
  page,
}) => {
  const requests = await workspace(page);
  await page.goto(`/console?org=${org}&view=setup`);
  await expect(
    page.getByRole("heading", { name: "Workspace setup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Configured · not verified", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Owner approval and external evidence required", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check database schema", exact: true })
    .click();
  await expect(
    page.getByText(
      "Database registry and expected security columns match this release.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests.filter((url) => url.includes("/activation?"))).toHaveLength(
    1,
  );
  expect(
    requests.some((url) => /prepare|authorize|notify|extract/.test(url)),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("an operations link opens the invoice without leaving the mounted console", async ({
  page,
}) => {
  await workspace(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await page
    .getByRole("region", { name: "Priority review queue" })
    .getByRole("link", { name: "Review linked invoice", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Record details" }),
  ).toContainText("INV-SETUP");
});

test("retained recovery links hydrate records outside the bounded snapshot", async ({
  page,
}) => {
  const requests = await workspace(page, { payments: true, omitted: true });
  await page.goto(
    `/console?org=${org}&view=history&invoice=${invoice}&payment=${payment}`,
  );
  await expect(
    page.getByRole("heading", { name: "Payment 44444444", exact: true }),
  ).toBeVisible();
  expect(
    requests.some((url) => url.endsWith(`/records/invoice/${invoice}`)),
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment 44444444", exact: true }),
  ).toBeVisible();
});

test("payment refresh preserves manual selection and cannot strand a delayed inspection", async ({
  page,
}) => {
  await workspace(page, { payments: true });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/payments/${secondPayment}`, async (route) => {
    await gate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(fixturePayment(secondPayment)),
    });
  });
  await page.goto(
    `/console?org=${org}&view=history&invoice=${invoice}&payment=${payment}`,
  );
  await expect(
    page.getByRole("heading", { name: "Payment 44444444", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /55555555/ }).click();
  await expect(
    page.getByText("Loading payment details…", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  release();
  await expect(
    page.getByRole("heading", { name: "Payment 55555555", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading payment details…", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment 55555555", exact: true }),
  ).toBeVisible();
});

test("a changed same-console payment target hides stale actions while its detail is delayed or fails", async ({
  page,
}) => {
  await workspace(page, { payments: true });
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`**/payments/${secondPayment}`, async (route) => {
    started();
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: "Changed payment fixture is temporarily unavailable.",
        },
      }),
    });
  });
  await page.goto(
    `/console?org=${org}&view=history&invoice=${invoice}&payment=${payment}`,
  );
  await expect(
    page.getByRole("heading", { name: "Payment 44444444", exact: true }),
  ).toBeVisible();
  const nextTarget = `/console?org=${org}&view=history&invoice=${invoice}&payment=${secondPayment}`;
  await page.evaluate(
    (url) => window.history.pushState(null, "", url),
    nextTarget,
  );
  try {
    await requested;
    await expect(
      page.getByText("Loading payment details…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Payment 44444444", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText("Attach a destination relay transaction", { exact: true }),
    ).not.toBeVisible();
    release();
    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText: "Changed payment fixture is temporarily unavailable.",
        }),
    ).toBeVisible();
    await expect(
      page.getByText("Loading payment details…", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Payment 44444444", exact: true }),
    ).not.toBeVisible();
  } finally {
    release();
  }
});

test("scoped invoice links open exact record evidence and reject another tenant", async ({
  page,
}) => {
  const requests = await workspace(page);
  await page.goto(`/console?org=${org}&view=invoices&invoice=${invoice}`);
  await expect(
    page.getByRole("region", { name: "Record details" }),
  ).toContainText("INV-SETUP");
  await page
    .getByRole("region", { name: "Record details" })
    .getByRole("button", { name: /Fixture reviewed terms/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Record details" }),
  ).toContainText("Fixture reviewed terms");
  await page.goto(`/console?org=${other}&view=invoices&invoice=${invoice}`);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "outside your current workspace access" }),
  ).toBeVisible();
  expect(requests.some((url) => url.includes(`/organizations/${other}/`))).toBe(
    false,
  );
});

test("unconfigured console explains the owner infrastructure steps before login", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: "The live workspace is awaiting its dedicated database.",
        },
      }),
    }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "0.3.0",
        workspaceConfigured: false,
        executionEnabled: false,
      }),
    }),
  );
  await page.goto("/console");
  await expect(
    page.getByRole("heading", {
      name: "Connect your workspace infrastructure",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Owner setup steps", exact: true }),
  ).toHaveAttribute("href", "/docs/activation");
  await expect(
    page.getByRole("link", { name: "Explore the isolated demo", exact: true }),
  ).toBeVisible();
});
