import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import { runPilotCli } from "../../scripts/pilot";
import { createDemoFixture } from "../../src/lib/domain";
import { freezePilot, pilotMeasurementDraftSchema } from "../../src/lib/domain/pilot";

const now = "2026-10-13T12:00:00.000Z";
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function setup(mutator?: (draft: Record<string, unknown>) => void) {
  const dir = await mkdtemp(join(tmpdir(), "countersign-model-pilot-test-")); dirs.push(dir);
  const verification = createDemoFixture("missing-acceptance");
  const content = "Section 2: acceptance must name the September design obligation and an authorized customer. A merged pull request is activity only.";
  const envelope = { verification, originals: [{ sourceId: "agreement-source", sourceHash: "a".repeat(64), textSha256: createHash("sha256").update(content).digest("hex"), kind: "excerpt", location: "Section 2", content }] };
  const draft: Record<string, unknown> = {
    schemaVersion: 1, studyId: "synthetic-arm-test", adjudicatorId: "fixture-truth-holder",
    settlementAsset: { id: "test-usdc", label: "Test USDC", decimals: 6, identity: { ...verification.engagement.asset } }, operatingCostAsset: { id: "usd", label: "USD", decimals: 2 },
    consents: [{ businessId: "demo-org", localAnalysis: { evidenceId: "local-consent", grantedAt: "2026-10-12T00:00:00Z", revokedAt: null }, publication: null }],
    cases: [{ caseId: "case-1", businessId: "demo-org", vendorId: "vendor-studio", cohort: "founder-testnet", label: "confirmed-problem", incorrectIncrementalUnits: "1234567", obligationUnits: "800000000", dueAt: verification.invoice.dueAt, adjudicationEvidenceId: "SECRET-GROUND-TRUTH", snapshot: { asOf: verification.now, evidenceIds: ["agreement-source", "invoice-source", "acceptance-source"], content: envelope } }],
  };
  mutator?.(draft);
  const session = freezePilot(draft, "2026-10-13T09:00:00Z");
  const config = {
    schemaVersion: 1, runId: "run-1", trustedFrozenCommitment: session.frozen.commitment, codeCommit: "1".repeat(40), rulesVersion: "verifyObligation-v1", model: "fixture-model",
    assetBinding: { studyAssetId: "test-usdc", symbol: "USDC", chainId: 5042002, address: verification.engagement.asset.address, decimals: 6, termsCurrency: "USDC", invoiceCurrency: "USDC" },
    externalModelConsent: { businessId: "demo-org", caseId: "case-1", frozenCommitment: session.frozen.commitment, evidenceId: "model-processing-grant", provider: "openai", grantedAt: "2026-10-13T10:00:00Z", expiresAt: "2026-10-14T00:00:00Z", revokedAt: null as string | null },
  };
  const sessionFile = join(dir, "session.json"), configFile = join(dir, "config.json"), out = join(dir, "run");
  await writeFile(sessionFile, JSON.stringify(session)); await writeFile(configFile, JSON.stringify(config));
  return { dir, draft, session, config, sessionFile, configFile, out };
}
function args(s: Awaited<ReturnType<typeof setup>>) { return ["run-arms", s.sessionFile, "case-1", s.configFile, s.out, "--allow-external-model", "--allow-paid-call"]; }
function base(s: Awaited<ReturnType<typeof setup>>) {
  return { reservationDirectory: join(s.dir, "registry"), readCodeProvenance: async () => ({ head: "1".repeat(40), dirty: true, criticalFiles: { "fixture-code": "a".repeat(64) } }) };
}
function response(action = "ASK", sources = ["agreement-source", "acceptance-source"]) {
  return new Response(JSON.stringify({ id: "fixture-response", model: "fixture-model", usage: { input_tokens: 500, output_tokens: 80 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action, reason: "Activity is not authorized acceptance", sourceIds: sources, missing: ["Has owner-1 accepted design-2026-09 under engagement version 1?"] }) }] }] }));
}

it("runs strong rules and the existing model adapter on frozen sources without leaking truth or inventing measurements", async () => {
  const s = await setup(); let calls = 0;
  await runPilotCli(args(s), now, { ...base(s), apiKey: "DO-NOT-PERSIST-KEY", clock: () => now, fetcher: async (_url, init) => {
    calls++;
    const body = String(init?.body);
    expect(body).toContain("A merged pull request is activity only");
    expect(body).not.toContain("SECRET-GROUND-TRUTH"); expect(body).not.toContain("confirmed-problem"); expect(body).not.toContain("1234567"); expect(body).not.toContain("model-processing-grant");
    return response();
  } });
  expect(calls).toBe(1);
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("complete"); expect(result.rules.action).toBe("ASK");
  expect(result.agent.proposal.missing).toEqual(["Has owner-1 accepted design-2026-09 under engagement version 1?"]);
  expect(result.agent.providerResponseId).toBe("fixture-response"); expect(result.operatingCost).toBeNull(); expect(result.humanMinutes).toBeNull();
  expect(result.rulesQuestions[0].text).toContain("owner-1");
  expect(result.rulesQuestions[0].text).toContain("design-2026-09");
  expect(result.rulesQuestions[0].text).toContain("version 1");
  expect(result.questions[0]).toMatchObject({ questionIndex: 0, runId: "run-1", caseId: "case-1", inputCommitment: s.session.frozen.data.cases[0].inputCommitment });
  for (const arm of ["rules", "rules-agent"]) {
    const measurement = pilotMeasurementDraftSchema.parse(JSON.parse(await readFile(join(s.out, "measurement-" + arm + ".json"), "utf8")));
    expect(measurement.costUnits).toBeNull(); expect(measurement.reviewStartedAt).toBeNull(); expect(measurement.appliedToWorkflow).toBe(false); expect(measurement.settlement).toBeNull();
  }
  expect(await readFile(join(s.out, "request.json"), "utf8")).not.toContain("DO-NOT-PERSIST-KEY");
  expect((await readdir(join(s.dir, "registry")))).toHaveLength(1);
});

it("requires both paid-call and external-processing opt-ins before reserving or calling", async () => {
  const s = await setup(); let calls = 0;
  for (const flags of [[], ["--allow-paid-call"], ["--allow-external-model"]]) {
    await expect(runPilotCli(["run-arms", s.sessionFile, "case-1", s.configFile, s.out, ...flags], now, { ...base(s), apiKey: "key", fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/opt-in/i);
  }
  expect(calls).toBe(0); await expect(readdir(s.out)).rejects.toThrow();
});

it("refuses mismatched original source hashes before any model call", async () => {
  const s = await setup((draft) => {
    const cases = draft.cases as { snapshot: { content: { originals: { sourceHash: string }[] } } }[];
    cases[0].snapshot.content.originals[0].sourceHash = "b".repeat(64);
  });
  let calls = 0;
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/source.*hash/i);
  expect(calls).toBe(0);
});

it("reserves an uncertain attempt once and refuses a new output path with the same run identity", async () => {
  const s = await setup(); let calls = 0;
  const deps = { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => { calls++; throw new Error("timeout DO-NOT-PERSIST-KEY"); } };
  await runPilotCli(args(s), now, deps);
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("unknown"); expect(result.agent).toBeNull(); expect(result.operatingCost).toBeNull();
  expect(JSON.stringify(result)).not.toContain("DO-NOT-PERSIST-KEY");
  const retry = args(s); retry[4] = join(s.dir, "another-output");
  await expect(runPilotCli(retry, now, deps)).rejects.toThrow(/reserved|exists/i);
  expect(calls).toBe(1);
});

it("discards a returned proposal if external permission is revoked while the call is in flight", async () => {
  const s = await setup();
  await runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => {
    s.config.externalModelConsent.revokedAt = "2026-10-13T11:59:00Z";
    await writeFile(s.configFile, JSON.stringify(s.config));
    return response();
  } });
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("unknown"); expect(result.agent).toBeNull();
  expect(result.failure).toContain("consent");
});

it("rejects label-bearing envelopes and invalid model actions rather than inventing a successful agent result", async () => {
  const invalidEnvelope = await setup((draft) => {
    const cases = draft.cases as { snapshot: { content: Record<string, unknown> } }[];
    cases[0].snapshot.content.label = "valid";
  });
  await expect(runPilotCli(args(invalidEnvelope), now, { ...base(invalidEnvelope), apiKey: "key", fetcher: async () => response() })).rejects.toThrow();
  const s = await setup();
  await runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => response("PAY") });
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("unknown"); expect(result.agent).toBeNull();
  const measurement = JSON.parse(await readFile(join(s.out, "measurement-rules-agent.json"), "utf8"));
  expect(measurement.action).toBeNull();
});

it("binds exact settlement identity and full obligation rather than accepting equal-decimal USD or the partial invoice as the full amount", async () => {
  const s = await setup();
  s.config.assetBinding.symbol = "USD";
  await writeFile(s.configFile, JSON.stringify(s.config));
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", fetcher: async () => response() })).rejects.toThrow(/asset/i);
  const wrong = await setup((draft) => { (draft.cases as { obligationUnits: string }[])[0].obligationUnits = "400000000"; });
  await expect(runPilotCli(args(wrong), now, { ...base(wrong), apiKey: "key", fetcher: async () => response() })).rejects.toThrow(/obligation/i);
});

it("preserves genuine unapproved drafts as held rules cases without requiring invented approval", async () => {
  const s = await setup((draft) => {
    const content = (draft.cases as { snapshot: { content: { verification: ReturnType<typeof createDemoFixture> } } }[])[0].snapshot.content;
    content.verification = { ...content.verification, engagement: { ...content.verification.engagement, status: "draft", approvedBy: "", approvedAt: "" }, acceptances: [] };
  });
  await runPilotCli(["rules", s.sessionFile, "case-1", s.configFile, s.out], now, base(s));
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.rules.action).toBe("HOLD");
  expect(result.rules.findings.some((f: { code: string }) => f.code === "TERMS_UNAPPROVED")).toBe(true);
  expect(result.runtimeCode.dirty).toBe(true);
});

it("rejects a declared release SHA that differs from actual runtime HEAD before any paid request", async () => {
  const s = await setup();
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", readCodeProvenance: async () => ({ head: "2".repeat(40), dirty: false, criticalFiles: {} }), fetcher: async () => response() })).rejects.toThrow(/declared.*commit.*runtime/i);
});

it("keeps artifacts outside all Git checkouts including a symlink into the private planning repository", async () => {
  const s = await setup(), repo = join(s.dir, "private-git"), alias = join(s.dir, "alias");
  await mkdir(repo); await mkdir(join(repo, ".git")); await symlink(repo, alias);
  const run = args(s); run[4] = join(alias, "run");
  let calls = 0;
  await expect(runPilotCli(run, now, { ...base(s), apiKey: "key", fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/Git checkout/i);
  expect(calls).toBe(0);
});

it("rechecks active permission just before dispatch and preserves a zero-dispatch unknown reservation", async () => {
  const s = await setup(); let reads = 0, calls = 0;
  await runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now,
    readCodeProvenance: async () => {
      if (++reads === 2) { s.config.externalModelConsent.revokedAt = "2026-10-13T11:59:00Z"; await writeFile(s.configFile, JSON.stringify(s.config)); }
      return { head: "1".repeat(40), dirty: true, criticalFiles: {} };
    },
    fetcher: async () => { calls++; return response(); },
  });
  expect(calls).toBe(0);
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("unknown"); expect(result.dispatchedAt).toBeNull();
});

it("preserves bounded HTTP failure evidence while removing a provider-echoed API credential", async () => {
  const s = await setup(), apiKey = "PRIVATE-FIXTURE-API-KEY";
  await runPilotCli(args(s), now, { ...base(s), apiKey, clock: () => now,
    fetcher: async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "invalid " + apiKey } }), { status: 400 }),
  });
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.status).toBe("unknown");
  expect(result.failureDetails.httpStatus).toBe(400);
  const recorded = await readFile(join(s.out, "response.json"), "utf8");
  expect(recorded).toContain("invalid_request_error"); expect(recorded).not.toContain(apiKey);
});

it("allows a truthful partial invoice while binding the exact full hourly obligation", async () => {
  const s = await setup((draft) => {
    const c = (draft.cases as { obligationUnits: string; snapshot: { content: { verification: ReturnType<typeof createDemoFixture> } } }[])[0];
    const old = c.snapshot.content.verification;
    c.snapshot.content.verification = { ...old,
      engagement: { ...old.engagement, billingModel: "hourly", hourlyRate: "50000000", maximumQuantity: "10", amount: "1000000000", partialPayments: true },
      invoice: { ...old.invoice, amount: "100000000", quantity: "4.125" },
    };
    c.obligationUnits = "206250000";
  });
  await runPilotCli(["rules", s.sessionFile, "case-1", s.configFile, s.out], now, base(s));
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result.contractualBasis).toBe("hourly-rate-quantity");
  expect(result.rules.amount).toBe("100000000");
});

it("rejects future snapshots, changed text digests and unavailable source IDs before dispatch", async () => {
  for (const kind of ["future", "digest", "source"]) {
    const s = await setup((draft) => {
      const envelope = (draft.cases as { snapshot: { content: { verification: ReturnType<typeof createDemoFixture>; originals: { textSha256: string; sourceId: string }[] } } }[])[0].snapshot.content;
      if (kind === "future") envelope.verification = { ...envelope.verification, historySyncedAt: "2026-10-12T00:00:00Z" };
      if (kind === "digest") envelope.originals[0].textSha256 = "0".repeat(64);
      if (kind === "source") envelope.originals[0].sourceId = "fabricated";
    });
    let calls = 0;
    await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/Future|hash|unavailable/i);
    expect(calls).toBe(0);
  }
});

it("rejects USD business obligations rather than labeling their equal-decimal units as USDC", async () => {
  const s = await setup((draft) => {
    const envelope = (draft.cases as { snapshot: { content: { verification: ReturnType<typeof createDemoFixture> } } }[])[0].snapshot.content;
    const input = envelope.verification;
    envelope.verification = { ...input, engagement: { ...input.engagement, currency: "USD" }, invoice: { ...input.invoice, currency: "USD" } };
  });
  s.config.assetBinding.termsCurrency = "USD"; s.config.assetBinding.invoiceCurrency = "USD";
  await writeFile(s.configFile, JSON.stringify(s.config));
  let calls = 0;
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/currency|asset/i);
  expect(calls).toBe(0);
});

it("rejects cross-business source records rather than sending a held tenant mismatch under one business consent", async () => {
  const s = await setup((draft) => {
    const envelope = (draft.cases as { snapshot: { content: { verification: ReturnType<typeof createDemoFixture> } } }[])[0].snapshot.content;
    const input = envelope.verification;
    envelope.verification = { ...input, engagement: { ...input.engagement, tenantId: "unconsented-business" } };
  });
  let calls = 0;
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/business|tenant|scope/i);
  expect(calls).toBe(0);
});

it("rejects another same-symbol token even when mutable run config matches that token", async () => {
  const other = "0x1111111111111111111111111111111111111111";
  const s = await setup((draft) => {
    const content = (draft.cases as { snapshot: { content: { verification: ReturnType<typeof createDemoFixture> } } }[])[0].snapshot.content;
    const input = content.verification;
    content.verification = { ...input, engagement: { ...input.engagement, asset: { ...input.engagement.asset, address: other } } };
  });
  s.config.assetBinding.address = other;
  await writeFile(s.configFile, JSON.stringify(s.config));
  let calls = 0;
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "key", clock: () => now, fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/frozen.*asset.*identity/i);
  expect(calls).toBe(0);
});

it("exports blind prior-workflow context without adjudication, rules answers, model output or invented timing", async () => {
  const s = await setup();
  await runPilotCli(["context", s.sessionFile, "case-1", s.configFile, s.out], now, base(s));
  const context = await readFile(join(s.out, "context.json"), "utf8");
  expect(context).toContain("A merged pull request is activity only");
  for (const hidden of ["SECRET-GROUND-TRUTH", "confirmed-problem", "1234567", "availableActions", "rulesQuestions", "providerResponse"])
    expect(context).not.toContain(hidden);
  const measurement = pilotMeasurementDraftSchema.parse(JSON.parse(await readFile(join(s.out, "measurement-prior-workflow.json"), "utf8")));
  expect(measurement.arm).toBe("prior-workflow"); expect(measurement.action).toBeNull();
  expect(measurement.costUnits).toBeNull(); expect(measurement.operatorId).toBeNull();
  expect(await readdir(s.out)).not.toContain("rules.json");
});

it.each(["malformed-json", "unknown-key", "missing-file", "missing-consent"])("never prints private input or identifiers to executable stderr: %s", async (kind) => {
  const s = await setup(), marker = "sk-NONSECRET-PRIVATE-INPUT-FIXTURE";
  const invalidFile = join(s.dir, "invalid.json");
  let path = invalidFile, input = marker;
  if (kind === "unknown-key") input = JSON.stringify({ ...s.draft, [marker]: true });
  if (kind === "missing-consent") input = JSON.stringify({ ...s.draft, consents: [], cases: (s.draft.cases as Record<string, unknown>[]).map((c) => ({ ...c, businessId: marker })) });
  if (kind === "missing-file") path = join(s.dir, marker);
  else await writeFile(path, input);
  const output = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/pilot.ts", "freeze", path, join(s.dir, "unused.json")])
    .then((value) => ({ ...value, code: 0 }), (error: { stdout: string; stderr: string; code: number }) => error);
  expect(output.code).toBe(1);
  expect(output.stderr).not.toContain(marker);
  expect(output.stderr).not.toContain("sk-NONSECR");
  expect(output.stderr).not.toContain("sk-NONSECRET");
  expect(output.stderr).toContain("Pilot");
});


it("binds a DeepSeek run to provider, selected model, exact consent and durable one-call identity", async () => {
  const s = await setup();
  const config = { ...s.config, provider: "deepseek", model: "deepseek-flash", externalModelConsent: { ...s.config.externalModelConsent, provider: "deepseek", model: "deepseek-flash" } };
  await writeFile(s.configFile, JSON.stringify(config));
  vi.stubEnv("COUNTERSIGN_PILOT_DEEPSEEK_API_KEY", "DS-PRIVATE-FIXTURE-KEY");
  vi.stubEnv("COUNTERSIGN_PILOT_OPENAI_API_KEY", "WRONG-OPENAI-KEY");
  let calls = 0;
  await runPilotCli(args(s), now, { ...base(s), clock: () => now, fetcher: async (url, init) => {
    calls++;
    expect(url).toBe("https://api.deepseek.com/responses");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer DS-PRIVATE-FIXTURE-KEY" });
    const body = await response().json();
    return Response.json({ ...body, model: "deepseek-flash", status: "completed" });
  } });
  const result = JSON.parse(await readFile(join(s.out, "result.json"), "utf8"));
  expect(result).toMatchObject({ status: "complete", selectedProvider: "deepseek", selectedModel: "deepseek-flash", agent: { provider: "deepseek", model: "deepseek-flash", authority: "proposal-only" } });
  const journal = JSON.parse(await readFile(join(s.dir, "registry", (await readdir(join(s.dir, "registry")))[0]), "utf8"));
  expect(journal).toMatchObject({ provider: "deepseek", model: "deepseek-flash", maxCalls: 1 });
  const request = await readFile(join(s.out, "request.json"), "utf8");
  expect(request).toContain("https://api.deepseek.com/responses");
  expect(request).not.toContain("DS-PRIVATE-FIXTURE-KEY");
  await expect(runPilotCli([...args(s).slice(0, 4), join(s.dir, "second-output"), ...args(s).slice(5)], now, { ...base(s), clock: () => now })).rejects.toThrow();
  expect(calls).toBe(1);
});

it.each(["wrong-provider", "wrong-model", "missing-model"])("rejects DeepSeek %s consent before reservation or dispatch", async kind => {
  const s = await setup();
  const grant: Record<string, unknown> = { ...s.config.externalModelConsent, provider: "deepseek", model: "deepseek-flash" };
  if (kind === "wrong-provider") grant.provider = "openai";
  if (kind === "wrong-model") grant.model = "deepseek-v4-pro";
  if (kind === "missing-model") delete grant.model;
  await writeFile(s.configFile, JSON.stringify({ ...s.config, provider: "deepseek", model: "deepseek-flash", externalModelConsent: grant }));
  let calls = 0;
  await expect(runPilotCli(args(s), now, { ...base(s), apiKey: "fixture", fetcher: async () => { calls++; return response(); } })).rejects.toThrow(/consent/i);
  expect(calls).toBe(0);
  await expect(readdir(join(s.dir, "registry"))).rejects.toThrow();
});
