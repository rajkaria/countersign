import { describe, it, expect } from "vitest";
import {
  reviewerTrace,
  reviewerClarificationTrace,
  type ReviewerAnswer,
} from "../../src/lib/reviewer";
describe("reviewer fixtures use production verification without implying live proof", () => {
  it("activity cannot substitute for acceptance", () => {
    expect(reviewerTrace("acceptance").decision.action).toBe("ASK");
    expect(reviewerTrace("acceptance", true).decision.action).toBe("PAY");
  });
  it("a correction requires the current acceptance version", () => {
    expect(reviewerTrace("correction").decision.action).toBe("ASK");
    expect(reviewerTrace("correction", true).decision.action).toBe("PAY");
  });
  it("partial allocation tracks the exact residual", () => {
    const trace = reviewerTrace("partial", true);
    expect(trace.decision.amount).toBe("400000000");
    expect(trace.decision.action).toBe("PAY");
    expect(trace.input.allocations[0].amount).toBe("400000000");
  });
  it("a renamed duplicate remains held", () => {
    expect(reviewerTrace("duplicate").decision.action).toBe("HOLD");
    expect(reviewerTrace("duplicate", true).decision.action).toBe("HOLD");
  });
  it("unknown execution retains identity and refuses another submission", () => {
    const trace = reviewerTrace("uncertain", true);
    expect(trace.execution).toMatch(
      /uncertain.*Operation retained:.*Repeat submission rejected/s,
    );
    expect(trace.classification).toContain("synthetic");
    expect(trace.authorization).toContain("No signature");
    expect(trace.decision.action).toBe("HOLD");
    expect(trace.decision.executable).toBe(false);
    expect(trace.input.allocations[0].state).toBe("submitted");
  });
});

describe("frozen clarification comparison", () => {
  function answer(overrides: Partial<ReviewerAnswer> = {}): ReviewerAnswer {
    return {
      contextCommitment: reviewerClarificationTrace().frozen.contextCommitment,
      actorId: "owner-1",
      engagementVersion: 1,
      obligationId: "design-2026-09",
      response: "accept",
      confirmedSynthetic: true,
      ...overrides,
    };
  }
  it("uses the same committed context for a strong rules prompt and a recorded question", () => {
    const trace = reviewerClarificationTrace();
    expect(trace.rules.decision.action).toBe("ASK");
    expect(trace.rules.question).toContain("owner-1");
    expect(trace.rules.question).toContain("design-2026-09");
    expect(trace.agentFixture.modelExecuted).toBe(false);
    expect(trace.agentFixture.proposal.action).toBe("ASK");
    expect(trace.agentFixture.proposal.missing[0]).toContain(
      "keyboard navigation",
    );
    expect(
      trace.agentFixture.proposal.sourceIds.every((id) =>
        trace.frozen.evidence.some((source) => source.id === id),
      ),
    ).toBe(true);
    expect(trace.after).toBeNull();
  });
  it.each([
    { response: "activity-only" as const },
    { response: "decline" as const },
    { actorId: "vendor-1" },
    { engagementVersion: 2 },
    { obligationId: "other-obligation" },
  ])("keeps the gap open for a nonauthorizing answer %j", (change) => {
    const trace = reviewerClarificationTrace(answer(change));
    expect(trace.after?.decision.action).toBe("ASK");
    expect(trace.after?.decision.executable).toBe(false);
    expect(
      trace.after?.decision.findings.some(
        (finding) => finding.code === "ACCEPTANCE_REQUIRED",
      ),
    ).toBe(true);
  });
  it("reevaluates a submitted current-authority answer without changing money or the frozen context", () => {
    const original = reviewerClarificationTrace();
    const trace = reviewerClarificationTrace(answer());
    expect(trace.frozen.contextCommitment).toBe(
      original.frozen.contextCommitment,
    );
    expect(trace.rules.decision).toEqual(original.rules.decision);
    expect(trace.after?.decision.action).toBe("PAY");
    expect(trace.after?.decision.executable).toBe(false);
    expect(trace.after?.input.engagement).toEqual(
      original.frozen.input.engagement,
    );
    expect(trace.after?.input.invoice).toEqual(original.frozen.input.invoice);
    expect(trace.after?.input.policy).toEqual(original.frozen.input.policy);
    expect(trace.after?.input.allocations).toEqual(
      original.frozen.input.allocations,
    );
    expect(trace.after?.input.acceptances).toHaveLength(2);
    expect(trace.answer?.source.id).toContain("synthetic-answer");
    expect(
      trace.diff?.resolvedFindings.some(
        (finding) => finding.code === "ACCEPTANCE_REQUIRED",
      ),
    ).toBe(true);
  });
  it("rejects an answer bound to another context or lacking an explicit simulation acknowledgement", () => {
    expect(() =>
      reviewerClarificationTrace(
        answer({ contextCommitment: "0x" + "0".repeat(64) }),
      ),
    ).toThrow(/context/i);
    expect(() =>
      reviewerClarificationTrace(answer({ confirmedSynthetic: false })),
    ).toThrow();
  });
});
