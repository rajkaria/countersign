import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
  Fingerprint,
  LockKeyhole,
  CirclePause,
  Layers3,
  Radar,
  ReceiptText,
  BookOpen,
  Wallet,
  GitBranch,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/brand";
import { PaymentStory } from "@/components/marketing/payment-story";
import "./marketing.css";

export const metadata: Metadata = {
  title: { absolute: "Countersign — Every payment deserves the full picture." },
  alternates: { canonical: "/" },
  description:
    "Check every invoice against the agreement, accepted work and payment history. Review the evidence, resolve exceptions and keep control of your Safe.",
};
const capabilities = [
  {
    n: "01",
    icon: FileText,
    title: "Start with what you agreed.",
    text: "Bring the original agreement, current terms and invoice into the same review. Every amount belongs to an exact version.",
    href: "agreements",
    link: "Agreements & acceptance",
    visual: "terms",
  },
  {
    n: "02",
    icon: ShieldCheck,
    title: "Make the exception obvious.",
    text: "Missing acceptance. A changed destination. A renamed duplicate. Get a specific finding and a next step you can act on.",
    href: "verification",
    link: "How verification works",
    visual: "checks",
  },
  {
    n: "03",
    icon: Wallet,
    title: "See the commitments together.",
    text: "Plan against confirmed cash and existing obligations across a shared Safe. Keep amounts, currencies and reservations distinct.",
    href: "planning",
    link: "Cash & payment planning",
    visual: "plan",
  },
  {
    n: "04",
    icon: Fingerprint,
    title: "Keep the reason with the record.",
    text: "Connect the decision to its sources, retain uncertain operation identities and reconcile the destination before calling it settled.",
    href: "receipts",
    link: "Receipts & reconciliation",
    visual: "receipt",
  },
];
function FeatureVisual({ type }: { type: string }) {
  if (type === "terms")
    return (
      <div className="term-visual">
        <div>
          <FileText size={20} />
          <span>SERVICES AGREEMENT</span>
          <span className="mini-pill">v2 · approved</span>
        </div>
        <p>
          <span>Monthly retainer</span>
          <strong>
            3,200 <small>USDC</small>
          </strong>
        </p>
        <p>
          <span>Acceptance</span>
          <strong>
            Required <Check size={15} />
          </strong>
        </p>
        <div className="term-foot">
          <GitBranch size={14} /> Exact terms. Exact obligation.
        </div>
      </div>
    );
  if (type === "checks")
    return (
      <div className="check-visual">
        {[
          ["Agreement & amount", "Matched"],
          ["Recipient & history", "Checked"],
          ["Customer acceptance", "Missing"],
        ].map(([label, value], i) => (
          <div key={label} className={i === 2 ? "needs-review" : ""}>
            {i === 2 ? <CirclePause size={18} /> : <Check size={18} />}
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    );
  if (type === "plan")
    return (
      <div className="plan-visual">
        <span>ILLUSTRATIVE SAFE CAPACITY</span>
        <strong>
          18,500 <small>USDC</small>
        </strong>
        <div className="capacity-track">
          <i />
          <i />
          <i />
        </div>
        <div className="capacity-legend">
          <span>
            <i />
            Committed
          </span>
          <span>
            <i />
            Proposed
          </span>
          <span>
            <i />
            Buffer
          </span>
        </div>
      </div>
    );
  return (
    <div className="receipt-visual">
      <div className="receipt-seal">
        <Fingerprint size={42} strokeWidth={1} />
      </div>
      <div>
        <span>DECISION RECEIPT</span>
        <strong>One connected record.</strong>
        <p>
          Sources <ArrowRight size={13} /> Checks <ArrowRight size={13} />{" "}
          Outcome
        </p>
        <small>Integrity can be checked independently.</small>
      </div>
    </div>
  );
}
export default function Home() {
  return (
    <div className="marketing-site">
      <SiteHeader />
      <main id="main">
        <section className="landing-hero page-width">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow">
              <span />
              AGREEMENT-AWARE PAYMENT CONTROL
            </div>
            <h1>
              Every payment.
              <br />
              The <em>full picture.</em>
            </h1>
            <p className="landing-intro">
              What you agreed. What was accepted. What you already paid. Bring
              it together before the next payment moves.
            </p>
            <div className="landing-actions">
              <Link href="/review" className="button">
                Explore the demo <ArrowUpRight size={18} />
              </Link>
              <Link href="/docs" className="landing-secondary">
                Read the handbook <ArrowRight size={17} />
              </Link>
            </div>
            <p className="landing-note">
              <LockKeyhole size={14} /> Synthetic data. No wallet or funds
              required.
            </p>
            <div className="hero-index">
              <span>01 / MATCH THE TERMS</span>
              <span>02 / RESOLVE THE GAPS</span>
              <span>03 / KEEP THE EVIDENCE</span>
            </div>
          </div>
          <div className="hero-decision">
            <div className="hero-graphic-label">
              <span>AN ORDINARY INVOICE. A USEFUL SECOND LOOK.</span>
              <span>↘</span>
            </div>
            <PaymentStory />
          </div>
        </section>
        <div className="landing-principles">
          <div className="page-width">
            <span>
              <Layers3 size={18} />
              Agreements in context
            </span>
            <span>
              <ShieldCheck size={18} />
              Authority with limits
            </span>
            <span>
              <Fingerprint size={18} />
              Evidence you can follow
            </span>
            <span>
              <LockKeyhole size={18} />
              Your Safe stays yours
            </span>
          </div>
        </div>
        <section className="landing-section page-width" id="workflow">
          <div className="landing-section-heading">
            <div>
              <div className="landing-eyebrow">
                FROM SCATTERED RECORDS TO A CLEAR DECISION
              </div>
              <h2>
                An invoice asks for payment.
                <br />
                <span>The evidence tells you why.</span>
              </h2>
            </div>
            <p>
              Four connected steps give your team a clearer view of what is owed
              and what still needs a human decision.
            </p>
          </div>
          <div className="capability-grid">
            {capabilities.map((f) => (
              <article
                className={"capability capability-" + f.visual}
                key={f.n}
              >
                <div className="capability-heading">
                  <span>
                    {f.n} / {f.link.toUpperCase()}
                  </span>
                  <f.icon size={20} strokeWidth={1.5} />
                </div>
                <FeatureVisual type={f.visual} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <Link href={"/docs/" + f.href}>
                  {f.link}
                  <ArrowUpRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-control" id="control">
          <div className="page-width">
            <div className="control-intro">
              <div>
                <div className="landing-eyebrow">YOU SET THE AUTHORITY</div>
                <h2>
                  Start with visibility.
                  <br />
                  <em>Choose what comes next.</em>
                </h2>
              </div>
              <p>
                Each engagement has an explicit mode. Move forward when the
                evidence and infrastructure support it.
              </p>
            </div>
            <div className="authority-rail">
              {[
                {
                  icon: Radar,
                  n: "01",
                  title: "Observe",
                  label: "READ & UNDERSTAND",
                  text: "Check records, surface discrepancies and build a history. Keep every signing right.",
                  foot: "No spending authority",
                  href: "start-read-only",
                },
                {
                  icon: Layers3,
                  n: "02",
                  title: "Prepare",
                  label: "REVIEW A PROPOSAL",
                  text: "Turn an eligible obligation into an exact proposal. Your team authorizes the next step.",
                  foot: "A proposal is not a payment",
                  href: "planning",
                },
                {
                  icon: ShieldCheck,
                  n: "03",
                  title: "Delegate",
                  label: "SET EXPLICIT LIMITS",
                  text: "Bound destinations, amounts and expiry. Requires reviewed controls and separate activation.",
                  foot: "Live execution is not activated",
                  href: "security",
                },
              ].map((s) => (
                <article key={s.n}>
                  <div className="authority-node">
                    <s.icon size={22} />
                    <span>{s.n}</span>
                  </div>
                  <span className="stage-label">{s.label}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <Link href={"/docs/" + s.href}>
                    {s.foot}
                    <ArrowUpRight size={15} />
                  </Link>
                </article>
              ))}
            </div>
            <div className="control-bottom">
              <LockKeyhole size={17} />
              <span>
                Model suggestions cannot release money or widen their own
                policy.
              </span>
              <Link href="/docs/recovery">
                Understand recovery <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <section className="landing-section page-width evidence-section">
          <div>
            <div className="landing-eyebrow">A REASON YOU CAN INSPECT</div>
            <h2>
              “Why this payment?”
              <br />
              <span>Follow the answer.</span>
            </h2>
            <p>
              A decision is useful when you can trace it. Keep the approved
              terms, acceptance, checks and outcome connected through the whole
              lifecycle.
            </p>
            <Link className="landing-secondary" href="/docs/receipts">
              Inside a decision receipt <ArrowRight size={17} />
            </Link>
          </div>
          <div className="evidence-ledger">
            <div className="ledger-header">
              <Fingerprint size={21} />
              <span>THE EVIDENCE CHAIN</span>
              <small>ILLUSTRATIVE</small>
            </div>
            {[
              {
                n: "01",
                title: "The obligation",
                sub: "Original sources · approved terms · exact version",
                icon: FileText,
              },
              {
                n: "02",
                title: "The decision",
                sub: "Acceptance · current checks · bounded authority",
                icon: ShieldCheck,
              },
              {
                n: "03",
                title: "The outcome",
                sub: "Destination evidence · reconciled record",
                icon: ReceiptText,
              },
            ].map((s) => (
              <div className="ledger-row" key={s.n}>
                <span>{s.n}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.sub}</p>
                </div>
                <s.icon size={22} strokeWidth={1.4} />
              </div>
            ))}
            <div className="ledger-note">
              A submitted transaction still needs destination confirmation.
            </div>
          </div>
        </section>
        <section className="landing-reading page-width">
          <div className="landing-section-heading">
            <div>
              <div className="landing-eyebrow">THE FIELD GUIDE</div>
              <h2>
                Less guessing.
                <br />
                <span>More understanding.</span>
              </h2>
            </div>
            <Link href="/docs" className="landing-secondary">
              Explore all guides <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="reading-list">
            {[
              {
                n: "01",
                tag: "THE BIG PICTURE",
                title: "Why a payment needs more than an invoice.",
                text: "The records behind a good decision.",
                href: "why-countersign",
              },
              {
                n: "02",
                tag: "A PRACTICAL START",
                title: "Start read-only. Learn from the exceptions.",
                text: "A path to useful payment control.",
                href: "start-read-only",
              },
              {
                n: "03",
                tag: "FOLLOW THE MONEY",
                title: "A transaction hash is not the finish line.",
                text: "What destination settlement actually means.",
                href: "settlement-is-not-a-hash",
              },
            ].map((a) => (
              <Link href={"/docs/" + a.href} key={a.n}>
                <span className="reading-number">{a.n}</span>
                <div>
                  <span>{a.tag}</span>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                </div>
                <ArrowUpRight size={24} />
              </Link>
            ))}
          </div>
        </section>
        <section className="landing-faq page-width">
          <div>
            <div className="landing-eyebrow">BEFORE YOU START</div>
            <h2>
              A few good
              <br />
              questions.
            </h2>
            <BookOpen size={32} strokeWidth={1} />
          </div>
          <div>
            {[
              {
                q: "Can I try it without connecting a wallet?",
                a: "Yes. The guided walkthrough runs five synthetic cases with the production verifier. The full demo lets you explore review, planning and recovery in your browser. No wallet or funds are required.",
              },
              {
                q: "Does an AI decide when money moves?",
                a: "Model suggestions cannot authorize a payment. Approved terms, authorized acceptance, deterministic verification and the applicable execution authority must all agree. A model cannot expand that authority.",
              },
              {
                q: "Do I have to delegate to use Countersign?",
                a: "No. Observe is read-only. Prepare produces proposals for review. Delegation is a separate, explicit choice per engagement and requires configured and reviewed infrastructure.",
              },
              {
                q: "What is available today?",
                a: "The guided demo, full synthetic workspace and handbook are live. Production storage and an authenticated synthetic workspace have been exercised. Live payments and funded protection are not available on the public deployment. See release status for exact integration limits.",
              },
            ].map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="landing-final">
          <div className="page-width">
            <div className="landing-eyebrow">
              A SECOND LOOK. A CLEARER DECISION.
            </div>
            <h2>
              Make the next payment
              <br />
              <em>make sense.</em>
            </h2>
            <div className="landing-actions">
              <Link href="/review" className="button">
                Explore the demo <ArrowUpRight size={18} />
              </Link>
              <Link href="/docs/getting-started" className="landing-secondary">
                Get started <ArrowRight size={17} />
              </Link>
            </div>
            <p>One ordinary invoice. The full story behind it.</p>
          </div>
          <div className="final-symbol" aria-hidden="true">
            <i />
            <i />
          </div>
        </section>
        <aside className="landing-release page-width">
          <ShieldCheck size={20} />
          <p>
            <strong>Clear about what is live.</strong> The public demo cannot
            move money. Financial execution and funded protection require
            separate activation and reviewed controls.
          </p>
          <Link href="/docs/release-status">
            Release status <ArrowUpRight size={16} />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
