import { it, expect } from "vitest";
import { csvCell } from "../../src/lib/server/export";
it("neutralizes spreadsheet formula prefixes including hidden whitespace", () => {
  for (const value of ["=1+1", " +cmd", '\t=HYPERLINK("x")', "\r@SUM(1)", "-1"])
    expect(csvCell(value).startsWith("\"'")).toBe(true);
  expect(csvCell("Studio, Inc.")).toBe('"Studio, Inc."');
  expect(csvCell('a"b')).toBe('"a""b"');
});
