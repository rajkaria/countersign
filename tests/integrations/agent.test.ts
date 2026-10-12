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
