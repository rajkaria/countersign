import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { guides } from "../../src/lib/content/guides";
import { headings } from "../../src/lib/content/documents";

describe("public documentation corpus", () => {
  it("uses unique, allowlisted public Markdown files with valid internal guide links", () => {
    const slugs = new Set(guides.map((g) => g.slug));
    expect(slugs.size).toBe(guides.length);
    for (const guide of guides) {
      expect(guide.file).toMatch(/^[a-zA-Z0-9-]+\.md$/);
      const content = readFileSync(
        path.join(process.cwd(), "docs", guide.file),
        "utf8",
      );
      expect(
        headings(content).filter((h) => h.level === 1).length,
        guide.slug,
      ).toBe(1);
      expect((content.match(/^```/gm)?.length ?? 0) % 2, guide.slug).toBe(0);
      for (const match of content.matchAll(
        /\]\(\/docs\/([a-z0-9-]+)(?:#[^)]*)?\)/g,
      )) {
        expect(slugs.has(match[1]), `${guide.slug} links to ${match[1]}`).toBe(
          true,
        );
      }
      expect(content, guide.slug).not.toMatch(
        /\/Users\/|internal\/hackathon|\.ocean\//,
      );
    }
  });
  it("creates stable unique anchors and ignores headings inside fenced code", () => {
    expect(
      headings(
        "# Guide\n## Examples\n```md\n## Hidden\n```\n## Examples\n### Next step",
      ),
    ).toEqual([
      { title: "Guide", id: "guide", level: 1 },
      { title: "Examples", id: "examples", level: 2 },
      { title: "Examples", id: "examples-2", level: 2 },
      { title: "Next step", id: "next-step", level: 3 },
    ]);
  });
});
