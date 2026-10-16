import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  ShieldCheck,
  Bot,
  Play,
  Files,
} from "lucide-react";
import { guides, guideGroups } from "@/lib/content/guides";
import { DecisionExplainer } from "./decision-explainer";
const paths = [
  {
    icon: Play,
    n: "01",
    title: "See it in action",
    description:
      "Five cases. One production verifier. Explore the demo without a wallet.",
    href: "/review",
    link: "Open the walkthrough",
  },
  {
    icon: BookOpen,
    n: "02",
    title: "Run your first review",
    description:
      "Understand agreements, acceptance and the path from an invoice to a decision.",
    href: "/docs/getting-started",
    link: "Start with the basics",
  },
  {
    icon: Code2,
    n: "03",
    title: "Build & operate",
    description:
      "Connect the API, understand the data model and check deployment readiness.",
    href: "/docs/api",
    link: "Explore the API",
  },
];
export function DocsHome() {
  return (
    <div className="docs-home">
      <div className="docs-home-kicker">
        <span />
        THE COUNTERSIGN HANDBOOK
      </div>
      <h1>
        Understand the payment.
        <br />
        <span>Keep control of the process.</span>
      </h1>
      <p className="docs-home-intro">
        Practical guides to what is owed, what needs a decision, and what
        happens next. Start with a walkthrough or go straight to the detail.
      </p>
      <div className="docs-home-actions">
        <Link className="button" href="/docs/getting-started">
          Get started <ArrowRight size={16} />
        </Link>
        <a href="#guide-directory">
          Browse all {guides.length} guides <ArrowDownIcon />
        </a>
      </div>
      <div className="docs-paths">
        {paths.map((path) => (
          <Link key={path.n} href={path.href}>
            <div>
              <path.icon size={20} />
              <span>{path.n}</span>
            </div>
            <h2>{path.title}</h2>
            <p>{path.description}</p>
            <strong>
              {path.link}
              <ArrowUpRight size={15} />
            </strong>
          </Link>
        ))}
      </div>
      <section className="docs-mental-model">
        <div className="docs-section-label">THE CORE IDEA</div>
        <h2>A payment decision has a reason.</h2>
        <p>
          The agreement defines the obligation. Evidence shows what was accepted
          and already paid. The verifier checks the supplied facts. Authority
          determines what can happen next.
        </p>
        <DecisionExplainer />
      </section>
      <section className="docs-quick-links">
        <Link href="/docs/payment-lifecycle">
          <Files size={19} />
          <span>
            <strong>Follow a payment from start to finish</strong>
            <small>One worked example, every step explained.</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link href="/docs/troubleshooting">
          <ShieldCheck size={19} />
          <span>
            <strong>Find the next step when something is held</strong>
            <small>Practical answers for common findings.</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      </section>
      <section id="guide-directory" className="docs-directory">
        <div className="docs-section-label">THE COMPLETE HANDBOOK</div>
        <h2>Find the guide you need.</h2>
        <p>Choose a topic. Every guide is also available as Markdown.</p>
        {guideGroups.map((group) => (
          <div className="docs-guide-group" key={group}>
            <h3>{group}</h3>
            <div>
              {guides
                .filter((g) => g.group === group)
                .map((g) => (
                  <Link key={g.slug} href={"/docs/" + g.slug}>
                    <span>
                      <strong>{g.title}</strong>
                      <small>{g.description}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </section>
      <div className="docs-agent-panel">
        <Bot size={26} />
        <div>
          <h2>Reading with an AI assistant?</h2>
          <p>
            The handbook has raw Markdown, a searchable index and a full LLM
            corpus. The same public sources power every format.
          </p>
          <Link href="/docs/agents">
            Use the agent documentation <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
function ArrowDownIcon() {
  return <span aria-hidden="true">↓</span>;
}
