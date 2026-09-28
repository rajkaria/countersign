import { readAllGuides } from "@/lib/content/documents";
import { siteOrigin } from "@/lib/content/guides";
export const dynamic = "force-static";
export async function GET() {
  const docs = await readAllGuides();
  return new Response(
    [
      "# Countersign — complete public handbook",
      "",
      "This corpus describes implemented software, not a fully activated live payment service. The demo is synthetic. Begin with Release status and For AI agents. Approved terms, acceptance, deterministic checks, and constrained authority gate execution; model suggestions do not authorize payment.",
      "",
      ...docs.map(
        (g) =>
          `---\n\nSource: ${siteOrigin}/docs/${g.slug}\nMarkdown: ${siteOrigin}/docs/raw/${g.slug}\n\n${g.content.trim()}\n`,
      ),
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
