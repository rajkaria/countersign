import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { guides, type Guide } from "./guides";
export const readGuide = cache(async (guide: Guide) =>
  readFile(path.join(process.cwd(), "docs", guide.file), "utf8"),
);
export const readAllGuides = cache(async () =>
  Promise.all(
    guides.map(async (guide) => ({
      ...guide,
      content: await readGuide(guide),
    })),
  ),
);
export function headings(content: string) {
  const counts = new Map<string, number>();
  let inCode = false;
  return content.split("\n").flatMap((line) => {
    if (line.startsWith("```")) {
      inCode = !inCode;
      return [];
    }
    if (inCode || !/^#{1,3} /.test(line)) return [];
    const title = line.replace(/^#{1,3} /, "");
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return [
      {
        title,
        id: count ? `${base}-${count + 1}` : base,
        level: line.indexOf(" "),
      },
    ];
  });
}
