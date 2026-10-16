import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronRight,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Markdown } from "@/components/docs/markdown";
import { DocsSearch } from "@/components/docs/docs-search";
import { CopyPage } from "@/components/docs/copy-page";
import { DocsHome } from "@/components/docs/docs-home";
import { DecisionExplainer } from "@/components/docs/decision-explainer";
import {
  guides,
  guideGroups,
  findGuide,
  siteOrigin,
} from "@/lib/content/guides";
import { readGuide, headings } from "@/lib/content/documents";
import "../handbook.css";
import "../experience.css";
const aliases: Record<string, string> = {
  authority: "security",
  evidence: "evaluation",
};
export const dynamicParams = false;
export function generateStaticParams() {
  return [
    { slug: [] },
    ...Object.keys(aliases).map((slug) => ({ slug: [slug] })),
    ...guides.map((g) => ({ slug: [g.slug] })),
  ];
}
function resolve(slug?: string[]) {
  if ((slug?.length ?? 0) > 1) return undefined;
  const key = slug?.[0] ?? "getting-started";
  return findGuide(aliases[key] ?? key);
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const slug = (await params).slug;
  if (!slug?.length)
    return {
      title: "Handbook",
      description:
        "Practical guides to agreements, payment decisions and bounded authority. Find a walkthrough, product guide or API reference.",
      alternates: { canonical: "/docs" },
    };
  const guide = resolve(slug);
  if (!guide) return { title: "Guide not found" };
  return {
    title: guide.title,
    description: guide.description,
    alternates: {
      canonical: `/docs/${guide.slug}`,
      types: { "text/markdown": `/docs/raw/${guide.slug}` },
    },
    openGraph: {
      title: `${guide.title} · Countersign`,
      description: guide.description,
      type: "article",
      url: `/docs/${guide.slug}`,
    },
  };
}
export default async function Docs({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const slug = (await params).slug;
  const isHome = !slug?.length;
  const guide = resolve(slug);
  if (!guide) notFound();
  const content = await readGuide(guide);
  const outline = headings(content).filter((h) => h.level === 2);
  const index = guides.findIndex((g) => g.slug === guide.slug);
  const previous = guides[index - 1];
  const next = guides[index + 1];
  const schema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: guide.title,
    description: guide.description,
    url: `${siteOrigin}/docs/${guide.slug}`,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "Countersign handbook",
      url: `${siteOrigin}/docs`,
    },
    publisher: { "@type": "Organization", name: "Countersign" },
  };
  return (
    <div className="handbook">
      {!isHome && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <header className="handbook-header">
        <Brand />
        <Link href="/docs" className="handbook-label">
          Handbook
        </Link>
        <DocsSearch />
        <Link href="/review" className="handbook-demo">
          Explore demo <ArrowUpRight size={15} />
        </Link>
      </header>
      <div
        className={"handbook-layout" + (isHome ? " handbook-home-layout" : "")}
      >
        <aside className="handbook-sidebar">
          <details className="handbook-mobile-nav">
            <summary>
              <BookOpen size={16} /> Browse the handbook{" "}
              <ChevronRight size={15} />
            </summary>
            <nav aria-label="Mobile documentation">
              <Link href="/docs" aria-current={isHome ? "page" : undefined}>
                Handbook home
              </Link>
              {guideGroups.map((group) => (
                <div key={group}>
                  <p>{group}</p>
                  {guides
                    .filter((g) => g.group === group)
                    .map((g) => (
                      <Link
                        key={g.slug}
                        href={`/docs/${g.slug}`}
                        aria-current={
                          !isHome && g.slug === guide.slug ? "page" : undefined
                        }
                      >
                        {g.title}
                      </Link>
                    ))}
                </div>
              ))}
            </nav>
          </details>
          <nav className="handbook-desktop-nav" aria-label="Documentation">
            <Link
              href="/docs"
              className="handbook-home-link"
              aria-current={isHome ? "page" : undefined}
            >
              <BookOpen size={15} /> Handbook home
            </Link>
            {guideGroups.map((group) => (
              <div key={group}>
                <p>{group}</p>
                {guides
                  .filter((g) => g.group === group)
                  .map((g) => (
                    <Link
                      key={g.slug}
                      href={`/docs/${g.slug}`}
                      aria-current={
                        !isHome && g.slug === guide.slug ? "page" : undefined
                      }
                    >
                      {g.title}
                    </Link>
                  ))}
              </div>
            ))}
          </nav>
          <Link className="handbook-agent-link" href="/docs/agents">
            <Bot size={17} />
            <span>
              Reading with an AI?<small>Markdown & agent guidance</small>
            </span>
            <ArrowUpRight size={14} />
          </Link>
        </aside>
        <main id="main" className="handbook-main">
          <article className="handbook-article">
            {isHome ? (
              <DocsHome />
            ) : (
              <>
                <div className="handbook-breadcrumb">
                  <Link href="/docs">Handbook</Link>
                  <ChevronRight size={12} />
                  <span>{guide.group}</span>
                </div>
                <div className="handbook-tools">
                  <span>
                    {Math.max(1, Math.ceil(content.split(/\s+/).length / 220))}{" "}
                    min read
                  </span>
                  <CopyPage key={guide.slug} slug={guide.slug} />
                  <a href={`/docs/raw/${guide.slug}`}>
                    Markdown <ArrowUpRight size={12} />
                  </a>
                </div>
                {outline.length > 0 && (
                  <details className="handbook-mobile-outline">
                    <summary>
                      On this page <ChevronRight size={14} />
                    </summary>
                    <nav aria-label="Mobile page outline">
                      {outline.map((h) => (
                        <a key={h.id} href={"#" + h.id}>
                          {h.title}
                        </a>
                      ))}
                    </nav>
                  </details>
                )}
                <Markdown
                  content={content}
                  afterIntroduction={
                    [
                      "getting-started",
                      "verification",
                      "payment-lifecycle",
                    ].includes(guide.slug) ? (
                      <DecisionExplainer />
                    ) : undefined
                  }
                />
                <div className="handbook-page-nav">
                  {previous ? (
                    <Link href={`/docs/${previous.slug}`}>
                      <span>
                        <ArrowLeft size={13} /> Previous
                      </span>
                      <strong>{previous.title}</strong>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <Link href={`/docs/${next.slug}`}>
                      <span>
                        Next <ArrowRight size={13} />
                      </span>
                      <strong>{next.title}</strong>
                    </Link>
                  )}
                </div>
              </>
            )}
            <footer className="handbook-footer">
              These guides describe implemented software and its limits.{" "}
              <Link href="/docs/release-status">Check release status</Link>{" "}
              before relying on a live integration.
              <div>
                <Link href="/llms.txt">LLM index</Link>
                <Link href="/llms-full.txt">Full Markdown corpus</Link>
                <Link href="/">Countersign home ↗</Link>
              </div>
            </footer>
          </article>
        </main>
        {!isHome && (
          <aside className="handbook-outline">
            <p>ON THIS PAGE</p>
            <nav aria-label="On this page">
              {outline.map((h) => (
                <a key={h.id} href={`#${h.id}`}>
                  {h.title}
                </a>
              ))}
            </nav>
            <div>
              <span className="story-dot" />
              PUBLIC DEMO
              <Link href="/docs/release-status">
                See availability & activation gates <ArrowUpRight size={13} />
              </Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
