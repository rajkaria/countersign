// Synthetic auth transport fixtures with real EIP-191 signatures. No owner keys or live sessions.
import { test, expect, type Page, type Route } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import { hexToString, verifyMessage } from "viem";

const signer = privateKeyToAccount(`0x${"19".repeat(32)}`);
const otherSigner = privateKeyToAccount(`0x${"23".repeat(32)}`);
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-10-16T02:00:00.000Z");
function challenge(wallet = signer.address, id = firstId, lifetime = 300000) {
  const expiresAt = new Date(now.getTime() + lifetime).toISOString();
  return { challengeId: id, expiresAt, message: `countersign.example wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to Countersign. This grants no spending permission.\n\nURI: https://countersign.example\nVersion: 1\nChain ID: 1\nNonce: fixture-${id}\nIssued At: ${now.toISOString()}\nExpiration Time: ${expiresAt}` };
}
async function send(route: Route, data: unknown, status = 200, headers: Record<string, string> = {}) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers });
}
async function authFixture(page: Page, options: { lifetime?: number; deferred?: { wait: Promise<void>; started: () => void; finished: () => void } } = {}) {
  const requests: { challenge: string[]; verify: { challengeId: string; signature: string }[] } = { challenge: [], verify: [] };
  const issued = new Map<string, { wallet: string; message: string }>();
  await page.clock.install({ time: now });
  await page.clock.setFixedTime(now);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/auth/challenge") {
      const { wallet } = request.postDataJSON();
      requests.challenge.push(wallet);
      const value = challenge(wallet, requests.challenge.length === 1 ? firstId : secondId, options.lifetime);
      issued.set(value.challengeId, { wallet, message: value.message });
      if (requests.challenge.length === 1 && options.deferred) {
        options.deferred.started();
        await options.deferred.wait;
        try { await send(route, value); } catch { /* The browser may have aborted this obsolete challenge request. */ }
        options.deferred.finished();
        return;
      }
      return send(route, value);
    }
    if (path === "/api/auth/verify") {
      const body = request.postDataJSON();
      requests.verify.push(body);
      const original = issued.get(body.challengeId);
      const valid = original && await verifyMessage({ address: original.wallet as `0x${string}`, message: original.message, signature: body.signature });
      return valid
        ? send(route, { authenticated: true }, 200, { "Set-Cookie": "cs_session=synthetic-browser-auth; HttpOnly; SameSite=Strict; Path=/" })
        : send(route, { error: { code: "SIGNATURE", message: "The signature does not match this sign-in request." } }, 401);
    }
    if (path === "/api/auth/me") return send(route, { wallet: signer.address, organizations: [] });
    return send(route, { error: { message: "Unexpected auth fixture request" } }, 404);
  });
  await page.goto("/login");
  return requests;
}
async function external(page: Page) {
  await page.getByRole("button", { name: "Sign with an external wallet", exact: true }).click({ timeout: 5000 });
  return { address: page.getByRole("textbox", { name: "Public Ethereum address", exact: true }),
    message: page.getByRole("textbox", { name: "Exact sign-in message", exact: true }),
    signature: page.getByRole("textbox", { name: "EIP-191 signature", exact: true }),
    create: page.getByRole("button", { name: "Create sign-in challenge", exact: true }),
    verify: page.getByRole("button", { name: "Complete sign-in", exact: true }) };
}

test("external EOA signs the exact copyable challenge and receives normal cookie authentication", async ({ page, context }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  const requests = await authFixture(page), form = await external(page);
  await form.address.fill(signer.address);
  await form.create.click();
  const message = challenge().message;
  await expect(form.message).toHaveValue(message);
  await expect(form.message).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Copy exact message", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(message);
  await expect(page.getByText(/EIP-191.*personal_sign/)).toBeVisible();
  await form.signature.fill(await signer.signMessage({ message }));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("external-wallet-expanded.png"), fullPage: true });
  await form.verify.click();
  await expect(page).toHaveURL(/\/console$/);
  expect(requests.challenge).toEqual([signer.address]);
  expect(requests.verify).toHaveLength(1);
  expect(requests.verify[0].challengeId).toBe(firstId);
  expect((await context.cookies()).find(cookie => cookie.name === "cs_session")).toMatchObject({ value: "synthetic-browser-auth", httpOnly: true, sameSite: "Strict" });
});

test("editing the address discards an obsolete pending challenge without replacing the current message", async ({ page }) => {
  let release!: () => void, started!: () => void, finished!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  const done = new Promise<void>(resolve => { finished = resolve; });
  const requests = await authFixture(page, { deferred: { wait, started, finished } }), form = await external(page);
  await form.address.fill(signer.address);
  await form.create.click();
  await pending;
  await form.address.fill(otherSigner.address);
  await form.create.click();
  await expect(form.message).toHaveValue(challenge(otherSigner.address, secondId).message);
  release(); await done;
  await expect(form.message).toHaveValue(challenge(otherSigner.address, secondId).message);
  await expect(page.locator("#external-wallet").getByRole("alert")).toHaveCount(0);
  expect(requests.verify).toHaveLength(0);
});

test("invalid addresses and malformed signatures stay local; server rejection cannot authenticate", async ({ page }) => {
  const requests = await authFixture(page), form = await external(page);
  await form.address.fill(`0x${"41".repeat(32)}`);
  await form.create.click();
  await expect(page.locator("#external-wallet").getByRole("alert")).toContainText("valid Ethereum address");
  expect(requests.challenge).toHaveLength(0);
  await form.address.fill(signer.address);
  await expect(page.locator("#external-wallet").getByRole("alert")).toHaveCount(0);
  await form.create.click();
  await form.signature.fill("not-an-EIP-191-signature");
  await form.verify.click();
  await expect(page.locator("#external-wallet").getByRole("alert")).toContainText("65-byte");
  expect(requests.verify).toHaveLength(0);
  await form.signature.fill(await otherSigner.signMessage({ message: challenge().message }));
  await form.verify.click();
  await expect(page.locator("#external-wallet").getByRole("alert")).toContainText("does not match");
  await expect(page).toHaveURL(/\/login$/);
  expect(requests.verify).toHaveLength(1);
  await form.address.fill(otherSigner.address);
  await expect(form.message).toHaveCount(0);
  await expect(form.signature).toHaveCount(0);
  await expect(page.locator("#external-wallet").getByRole("alert")).toHaveCount(0);
});

test("expired challenges cannot submit a signature and can be replaced explicitly", async ({ page }) => {
  const requests = await authFixture(page, { lifetime: 10000 }), form = await external(page);
  await form.address.fill(signer.address);
  await form.create.click();
  await expect(form.message).toHaveValue(challenge(signer.address, firstId, 10000).message);
  await form.signature.fill(await signer.signMessage({ message: challenge(signer.address, firstId, 10000).message }));
  await page.clock.fastForward(10100);
  await expect(page.getByRole("status")).toContainText("expired");
  await expect(form.verify).toBeDisabled();
  expect(requests.verify).toHaveLength(0);
  await expect(form.create).toBeEnabled();
});

test("injected Ethereum wallet sign-in still signs and verifies the original challenge", async ({ page }) => {
  const signed: string[] = [];
  await page.exposeFunction("signFixtureMessage", async (hex: `0x${string}`) => {
    const message = hexToString(hex); signed.push(message);
    return signer.signMessage({ message });
  });
  await page.addInitScript(({ wallet }) => {
    (window as unknown as { ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts") return [wallet];
        if (method === "personal_sign") return (window as unknown as { signFixtureMessage: (hex: unknown) => Promise<string> }).signFixtureMessage(params![0]);
        throw new Error("Unexpected wallet fixture request");
      },
    };
  }, { wallet: signer.address });
  const requests = await authFixture(page);
  await page.getByRole("button", { name: "Sign in with Ethereum →", exact: true }).click();
  await expect(page).toHaveURL(/\/console$/);
  expect(signed).toEqual([challenge().message]);
  expect(requests.verify).toHaveLength(1);
});


test("a browser clock two seconds slow still accepts the server's valid five-minute challenge", async ({ page }) => {
  await authFixture(page);
  await page.clock.setFixedTime(new Date(now.getTime() - 2000));
  const form = await external(page);
  await form.address.fill(signer.address);
  await form.create.click();
  await expect(form.message).toHaveValue(challenge().message);
  await expect(page.locator("#external-wallet").getByRole("alert")).toHaveCount(0);
});
