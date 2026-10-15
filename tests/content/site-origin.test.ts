import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public canonical origin", () => {
  it("uses the primary domain consistently across public discovery surfaces", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    vi.resetModules();
    const { siteOrigin, guides } = await import("../../src/lib/content/guides");
    const { default: sitemap } = await import("../../src/app/sitemap");
    const { default: robots } = await import("../../src/app/robots");
    const { GET: index } = await import("../../src/app/llms.txt/route");
    const { GET: full } = await import("../../src/app/llms-full.txt/route");
    const canonical = "https://www.usecountersign.xyz";

    expect(siteOrigin).toBe(canonical);
    expect(sitemap().map(({ url }) => url)).toEqual([
      canonical,
      `${canonical}/docs`,
      `${canonical}/review`,
      ...guides.map(({ slug }) => `${canonical}/docs/${slug}`),
    ]);
    expect(robots().sitemap).toBe(`${canonical}/sitemap.xml`);

    const indexText = await index().text();
    const fullText = await (await full()).text();
    expect(indexText).toContain(`${canonical}/llms-full.txt`);
    for (const { slug } of guides) {
      expect(indexText, slug).toContain(`${canonical}/docs/raw/${slug}`);
      expect(fullText, slug).toContain(`Source: ${canonical}/docs/${slug}\n`);
      expect(fullText, slug).toContain(`Markdown: ${canonical}/docs/raw/${slug}\n`);
    }
  });

  it("preserves an explicit deployment origin without duplicate trailing slashes", async () => {
    vi.stubEnv("APP_ORIGIN", "https://countersign.example.test/");
    vi.resetModules();
    const { siteOrigin } = await import("../../src/lib/content/guides");
    const { default: sitemap } = await import("../../src/app/sitemap");
    const { default: robots } = await import("../../src/app/robots");

    expect(siteOrigin).toBe("https://countersign.example.test");
    expect(sitemap().every(({ url }) => new URL(url).origin === siteOrigin)).toBe(true);
    expect(robots().sitemap).toBe("https://countersign.example.test/sitemap.xml");
  });
});
