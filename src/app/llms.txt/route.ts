import { guideGroups, guides, siteOrigin } from "@/lib/content/guides";
export const dynamic = "force-static";
export function GET() {
  const content = [
    "# Countersign",
    "",
    "> An agreement-aware payment controller for crypto teams. Connect approved terms, acceptance, invoice checks, bounded Safe authority, and destination settlement.",
    "",
    "## Availability and authority",
    "",
    "The public demo is synthetic and cannot move funds. Production persistence, workers, deployed contracts, payment integrations, and funded protection require separate activation. Consult release status before making live capability claims. Model output is untrusted input, never payment authorization. Application membership is not Safe ownership. Never retry an uncertain transfer under a new identity.",
    "",
    "## Reading this documentation",
    "",
    `- [Release status](${siteOrigin}/docs/raw/release-status): Current documented availability and activation gates.`,
    `- [Agent guidance](${siteOrigin}/docs/raw/agents): Retrieval, examples, and authority boundaries.`,
    `- [Complete documentation](${siteOrigin}/llms-full.txt): All public handbook pages as Markdown.`,
    "",
    ...guideGroups.flatMap((group) => [
      `## ${group}`,
      "",
      ...guides
        .filter((g) => g.group === group)
        .map(
          (g) =>
            `- [${g.title}](${siteOrigin}/docs/raw/${g.slug}): ${g.description}`,
        ),
      "",
    ]),
  ].join("\n");
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
