import { describe, it, expect } from "vitest";
import { reviewerTrace } from "../../src/lib/reviewer";
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
    expect(trace.execution).toMatch(/uncertain.*Operation retained:.*Repeat submission rejected/s);
    expect(trace.classification).toContain("synthetic");
    expect(trace.authorization).toContain("No signature");
    expect(trace.decision.action).toBe("HOLD");
    expect(trace.decision.executable).toBe(false);
    expect(trace.input.allocations[0].state).toBe("submitted");
  });
});
