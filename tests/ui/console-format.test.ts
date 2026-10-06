import { describe, it, expect } from "vitest";
import {
  formatAmount,
  toAtomic,
  toDecimal,
  sourceUrl,
  formatTime,
} from "../../src/components/console/format";
describe("console financial presentation", () => {
  it("preserves six-decimal installments and avoids Number precision loss", () => {
    expect(toAtomic("25.000001", true)).toBe("25000001");
    expect(formatAmount("25000001")).toBe("25.000001 USDC");
    expect(toAtomic(toDecimal("123456789012345678901234"))).toBe(
      "123456789012345678901234",
    );
    expect(formatAmount("1000000", "USD")).toBe("1.00 USD");
  });
  it("rejects rounded, exponential and zero proposal inputs", () => {
    for (const value of ["0", "0.000000", "1.0000001", "1e2", "-1"])
      expect(() => toAtomic(value, true)).toThrow();
    expect(toAtomic("0")).toBe("0");
    expect(formatAmount("malformed")).toBe("Unavailable");
  });
  it("does not hide the smallest spendable unit or change recorded currency", () => {
    expect(formatAmount("1")).toBe("0.000001 USDC");
    expect(formatAmount("999999", "USD")).toBe("0.999999 USD");
    expect(formatAmount("0")).toBe("0.00 USDC");
  });
  it("keeps absent and malformed observation times explicit", () => {
    expect(formatTime(undefined)).toBe("Not recorded");
    expect(formatTime("not-a-timestamp")).toBe("not-a-timestamp");
  });
  it("links only web sources and keeps unsafe or private record references as text", () => {
    expect(sourceUrl("https://github.com/owner/repo/pull/1")).toBe(
      "https://github.com/owner/repo/pull/1",
    );
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,content",
      "record://private",
      "file:///tmp/private",
    ])
      expect(sourceUrl(value)).toBeNull();
  });
});
