import { it, expect } from "vitest";
import { createDemoFixture, verifyObligation } from "../../src/lib/domain";
import { decisionEvidence, proposeDecisionWithModel } from "../../src/lib/integrations/agent";
it("model evidence is allowlisted and bound to the verified snapshot", () => {
  const input = createDemoFixture("missing-acceptance");
  const decision = verifyObligation(input);
  const evidence = decisionEvidence(input, decision);
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence.every((e) => decision.sourceIds.includes(e.id))).toBe(true);
  expect(JSON.stringify(evidence)).toContain("activity");
  expect(JSON.stringify(evidence)).toContain('"version\\\":1');
  expect(decisionEvidence(input, { ...decision, sourceIds: [] })).toEqual([]);
});
it("records proposal provenance and never permits fabricated citations or widened actions", async () => {
  const input = createDemoFixture("missing-acceptance"), decision = verifyObligation(input);
  let invoked = 0;
  const call = (action: string, sources: readonly string[]) => proposeDecisionWithModel({ decision, evidence: decisionEvidence(input, decision), apiKey: "fixture-key", model: "fixture-model" }, async (_url, init) => {
    invoked++;
    const request = JSON.parse(String(init?.body));
    expect(request.store).toBe(false);
    expect(request).not.toHaveProperty("tools");
    expect(JSON.stringify(request)).not.toContain("fixture-key");
    return new Response(JSON.stringify({ id: "fixture-response", model: "fixture-model", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action, reason: "Need authorized acceptance", sourceIds: sources, missing: ["Has an authorized owner accepted this exact version?"] }) }] }] }));
  });
  const result = await call("ASK", decision.sourceIds);
  expect(result).toMatchObject({ authority: "proposal-only", providerResponseId: "fixture-response", promptVersion: "countersign-evidence-v1" });
  expect(result.proposal.missing).toHaveLength(1);
  await expect(call("PAY", decision.sourceIds)).rejects.toThrow(/bounds/);
  await expect(call("ASK", ["fabricated"])).rejects.toThrow(/unavailable/);
  expect(invoked).toBe(3);
});


it("routes DeepSeek proposals only to the fixed Responses endpoint and preserves proposal bounds", async () => {
  const input = createDemoFixture("missing-acceptance"), decision = verifyObligation(input);
  const result = await proposeDecisionWithModel({ decision, evidence: decisionEvidence(input, decision), apiKey: "deepseek-fixture", model: "deepseek-flash", provider: "deepseek" }, async (url, init) => {
    expect(url).toBe("https://api.deepseek.com/responses");
    expect(init?.redirect).toBe("error");
    const body = JSON.parse(String(init?.body));
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body).not.toHaveProperty("tools");
    return Response.json({ id: "ds-fixture", model: "deepseek-flash", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action: "ASK", reason: "Acceptance missing", sourceIds: decision.sourceIds, missing: ["Explicit authorized acceptance"] }) }] }] });
  });
  expect(result).toMatchObject({ provider: "deepseek", providerResponseId: "ds-fixture", model: "deepseek-flash", authority: "proposal-only", proposal: { action: "ASK" } });
});

it.each(["incomplete", "failed", "in_progress"])("does not accept a DeepSeek %s response as a usable proposal", async status => {
  const input = createDemoFixture("missing-acceptance"), decision = verifyObligation(input);
  await expect(proposeDecisionWithModel({ decision, evidence: decisionEvidence(input, decision), apiKey: "fixture", model: "deepseek-flash", provider: "deepseek" }, async () => Response.json({ id: "ds-fixture", model: "deepseek-flash", status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action: "ASK", reason: "Acceptance missing", sourceIds: decision.sourceIds, missing: [] }) }] }] }))).rejects.toThrow(/complete/i);
});
