import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Countersign — Before money moves. Make it add up.",
  alternates: { canonical: "/" },
  description:
    "Bring agreements, invoices, acceptance, and payment history into one review. Explore agreement-aware payments with bounded Safe authority.",
};
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
  Fingerprint,
  LockKeyhole,
  ScanLine,
  CirclePause,
  ChevronRight,
  Layers3,
  Radar,
  Route,
  BookOpen,
  ArrowDown,
  Wallet,
  ReceiptText,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/brand";
import { PaymentStory } from "@/components/marketing/payment-story";
import "./marketing.css";

const features = [
  {
    icon: FileText,
    label: "01 / AGREEMENTS",
    title: "The terms are the source of truth.",
    text: "Versioned agreements connect each invoice to what you actually approved. Amount, timing, destination, and acceptance all have a place.",
    href: "agreements",
    className: "feature-agreements",
  },
  {
    icon: ScanLine,
    label: "02 / VERIFICATION",
    title: "Catch the almost-right payment.",
    text: "Duplicate invoice? Missing acceptance? Changed wallet? Deterministic checks turn discrepancies into an explicit hold and a clear next step.",
    href: "verification",
    className: "feature-verification",
  },
  {
    icon: Wallet,
    label: "03 / CASH PLANNING",
    title: "One treasury. The whole picture.",
    text: "Plan against confirmed cash and existing commitments across a shared Safe. An eligible invoice still needs room in the plan.",
    href: "planning",
    className: "feature-planning",
  },
  {
    icon: ReceiptText,
    label: "04 / RECONCILIATION",
    title: "Follow it all the way through.",
    text: "Keep the payment identity through retries, confirm the destination, and export a receipt connected to the decision that started it.",
    href: "payments",
    className: "feature-receipts",
  },
];

export default function Home() {
  return (
    <div className="marketing-site">
      <SiteHeader />
      <main id="main">
        <section className="landing-hero page-width">
          <div className="hero-orbit" aria-hidden="true" />
          <div className="landing-hero-copy">
            <div className="landing-eyebrow">
              <span /> THE PAYMENT CONTROLLER FOR CRYPTO TEAMS
            </div>
            <h1>
              Before money
              <br />
              moves.
              <br />
              <em>Make it add up.</em>
            </h1>
            <p className="landing-intro">
              The agreement. The delivery. The last payment.
              <br className="desktop-break" /> Countersign brings the whole
              story together—
              <br className="desktop-break" />
              so your next payment has a reason behind it.
            </p>
            <div className="landing-actions">
              <Link href="/workspace" className="button">
                Explore the demo <ArrowUpRight size={18} />
              </Link>
              <Link href="/docs/getting-started" className="landing-secondary">
                Meet Countersign <ArrowRight size={16} />
              </Link>
            </div>
            <p className="landing-note">
              <LockKeyhole size={13} /> Sample data. No wallet. No funds
              required.
            </p>
            <div className="hero-bottom-note">
              <span>CONTEXT IN.</span>
              <span className="tiny-line" />
              <span>CONFIDENCE OUT.</span>
              <ArrowDown size={15} />
            </div>
          </div>
          <PaymentStory />
        </section>
        <div className="landing-principles">
          <div className="page-width">
            <span>
              <Layers3 size={18} /> Agreement-aware
            </span>
            <span>
              <ShieldCheck size={18} /> Authority with limits
            </span>
            <span>
              <Fingerprint size={18} /> Evidence by design
            </span>
            <span>
              <LockKeyhole size={18} /> Your Safe stays yours
            </span>
          </div>
        </div>
        <section className="landing-section page-width" id="workflow">
          <div className="landing-section-heading">
            <div>
              <div className="landing-eyebrow">
                THE SPACE BETWEEN AN INVOICE AND A TRANSFER
              </div>
              <h2>
                Less piecing it together.
                <br />
                <span>More seeing it clearly.</span>
              </h2>
            </div>
            <p>
              A wallet tells you where money went.
              <br />
              Countersign helps your team understand
              <br />
              whether it should go in the first place.
            </p>
          </div>
          <div className="landing-features">
            {features.map((f, i) => (
              <article
                className={`landing-feature ${f.className}`}
                key={f.href}
              >
                <div className="feature-top">
                  <span>{f.label}</span>
                  <f.icon size={21} strokeWidth={1.5} />
                </div>
                <div className="feature-graphic" aria-hidden="true">
                  {i === 0 && (
                    <div className="agreement-graphic">
                      <span>
                        MASTER SERVICES AGREEMENT <Check size={14} />
                      </span>
                      <div />
                      <div />
                      <div />
                      <p>
                        <span>Monthly retainer</span>
                        <strong>3,200 USDC</strong>
                      </p>
                      <small>
                        <span>v1 · approved</span>
                        <span className="graphic-signature">
                          Countersigned ↗
                        </span>
                      </small>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="verification-graphic">
                      <p>
                        <Check size={15} /> Terms match <span>PASS</span>
                      </p>
                      <p>
                        <Check size={15} /> No duplicate <span>PASS</span>
                      </p>
                      <p>
                        <CirclePause size={15} /> Acceptance missing{" "}
                        <span>HOLD</span>
                      </p>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="planning-graphic">
                      <div>
                        <span>Illustrative cash plan</span>
                        <strong>
                          18,500 <small>USDC</small>
                        </strong>
                      </div>
                      <div className="cash-bars">
                        <i />
                        <i />
                        <i />
                      </div>
                      <p>
                        <span>
                          <i /> Commitments
                        </span>
                        <span>
                          <i /> This plan
                        </span>
                        <span>
                          <i /> Buffer
                        </span>
                      </p>
                    </div>
                  )}
                  {i === 3 && (
                    <div className="receipt-graphic">
                      <Fingerprint size={34} strokeWidth={1} />
                      <div>
                        <span>ONE CONNECTED RECORD</span>
                        <p>
                          Decision <ArrowRight size={13} /> Transfer{" "}
                          <ArrowRight size={13} /> Receipt
                        </p>
                        <small>Source confirmed ≠ destination settled</small>
                      </div>
                    </div>
                  )}
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <Link href={`/docs/${f.href}`}>
                  Explore the feature <ArrowUpRight size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-control" id="control">
          <div className="page-width">
            <div className="control-intro">
              <div>
                <div className="landing-eyebrow">
                  TRUST IS A SETTING. NOT A LEAP.
                </div>
                <h2>
                  A little help.
                  <br />
                  Exactly as much
                  <br />
                  <em>authority as you choose.</em>
                </h2>
              </div>
              <div>
                <p>
                  Start by observing. Prepare when you’re ready. Delegate only
                  within explicit, approved limits—per engagement.
                </p>
                <Link href="/docs/security">
                  Understand the authority model <ArrowUpRight size={17} />
                </Link>
              </div>
            </div>
            <div className="landing-stages">
              {[
                {
                  icon: Radar,
                  n: "01",
                  title: "Observe",
                  tag: "START HERE",
                  text: "Read the records. Surface discrepancies. Build confidence before granting execution authority.",
                  foot: "Visibility without spending authority",
                },
                {
                  icon: Layers3,
                  n: "02",
                  title: "Prepare",
                  tag: "REVIEW FIRST",
                  text: "Turn eligible obligations into proposals. Your team reviews and authorizes the next step.",
                  foot: "A proposal is not a payment",
                },
                {
                  icon: ShieldCheck,
                  n: "03",
                  title: "Delegate",
                  tag: "WITHIN YOUR RULES",
                  text: "Authorize a bounded policy with exact destinations, spending caps, expiry, and independent recovery.",
                  foot: "Requires reviewed, activated infrastructure",
                },
              ].map((s) => (
                <article key={s.title}>
                  <div>
                    <s.icon size={25} strokeWidth={1.3} />
                    <span>{s.n}</span>
                  </div>
                  <span className="stage-label">{s.tag}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <small>
                    <Check size={13} />
                    {s.foot}
                  </small>
                </article>
              ))}
            </div>
            <div className="landing-control-footer">
              <LockKeyhole size={17} />
              <span>
                The agent cannot widen its own policy. Your human signing
                threshold stays intact.
              </span>
              <Link href="/docs/recovery">
                Pause & recover <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
        <section className="landing-section page-width landing-proof">
          <div>
            <div className="landing-eyebrow">
              A PAPER TRAIL THAT ACTUALLY CONNECTS
            </div>
            <h2>
              “Why this payment?”
              <br />
              <span>Follow the answer.</span>
            </h2>
            <p>
              From the terms you approved to the outcome you can verify. Every
              decision should be explainable, every exception inspectable, and
              every payment reconcilable.
            </p>
            <Link className="landing-secondary" href="/docs/receipts">
              Inside a decision receipt <ArrowRight size={16} />
            </Link>
            <div className="proof-tags">
              <span>
                <Fingerprint size={15} /> Portable evidence
              </span>
              <span>
                <Route size={15} /> Destination confirmation
              </span>
            </div>
          </div>
          <div className="evidence-path">
            <div className="evidence-path-top">
              <Fingerprint size={24} />
              <span>THE EVIDENCE CHAIN</span>
              <span>ILLUSTRATIVE</span>
            </div>
            {[
              {
                n: "01",
                title: "The obligation",
                sub: "Approved terms · exact version",
                icon: FileText,
              },
              {
                n: "02",
                title: "The decision",
                sub: "Acceptance · checks · authority",
                icon: ShieldCheck,
              },
              {
                n: "03",
                title: "The outcome",
                sub: "Destination evidence · accounting record",
                icon: ReceiptText,
              },
            ].map((s) => (
              <div className="evidence-path-row" key={s.n}>
                <span>{s.n}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.sub}</p>
                </div>
                <s.icon size={20} strokeWidth={1.3} />
              </div>
            ))}
            <div className="evidence-path-end">
              <Check size={15} /> Integrity can be checked. Live truth needs
              live evidence.
            </div>
          </div>
        </section>
        <section className="landing-reading page-width">
          <div className="landing-section-heading">
            <div>
              <div className="landing-eyebrow">THE COUNTERSIGN FIELD GUIDE</div>
              <h2>
                Understand the why.
                <br />
                <span>Get comfortable with the how.</span>
              </h2>
            </div>
            <Link href="/docs" className="landing-secondary">
              Read the handbook <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="reading-grid">
            {[
              {
                tag: "THE BIG PICTURE",
                title: "Why your next payment needs more than an invoice.",
                href: "why-countersign",
                n: "01",
              },
              {
                tag: "A PRACTICAL START",
                title: "Start with visibility. Earn the case for automation.",
                href: "start-read-only",
                n: "02",
              },
              {
                tag: "FOLLOW THE MONEY",
                title: "A transaction hash isn’t the end of the story.",
                href: "settlement-is-not-a-hash",
                n: "03",
              },
            ].map((a) => (
              <Link
                key={a.href}
                href={`/docs/${a.href}`}
                className="reading-card"
              >
                <div>
                  <BookOpen size={21} strokeWidth={1.4} />
                  <span>{a.n}</span>
                </div>
                <span>{a.tag}</span>
                <h3>{a.title}</h3>
                <p>
                  Read the article <ArrowUpRight size={17} />
                </p>
              </Link>
            ))}
          </div>
        </section>
        <section className="landing-faq page-width">
          <div>
            <div className="landing-eyebrow">A FEW THINGS, UP FRONT</div>
            <h2>Clear by design.</h2>
          </div>
          <div>
            {[
              {
                q: "Can I try it without connecting a wallet?",
                a: "Yes. The interactive demo uses synthetic records in your browser. Explore invoice review, acceptance, exceptions, receipts, and recovery without connecting a wallet or moving funds.",
              },
              {
                q: "Does an AI decide when money moves?",
                a: "Model suggestions cannot authorize a payment. Approved terms, authorized acceptance, deterministic verification, and the applicable execution authority must all agree. A model cannot expand that authority.",
              },
              {
                q: "Do I have to delegate to use Countersign?",
                a: "No. Observe is read-only. Prepare produces proposals for review. Delegation is a separate, explicit choice per engagement, and requires configured and reviewed infrastructure.",
              },
              {
                q: "What is available today?",
                a: "The public demo and handbook are available. Production persistence, payment integrations, deployed contracts, and the persistent worker still require activation. Live payments and funded protection are not available on the public deployment.",
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
        <section className="landing-final page-width">
          <div className="final-art" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="landing-eyebrow">
            A SECOND LOOK. A BETTER PAYMENT.
          </div>
          <h2>
            Give your next payment
            <br />
            <em>the full picture.</em>
          </h2>
          <div className="landing-actions">
            <Link href="/workspace" className="button">
              Explore the demo <ArrowUpRight size={18} />
            </Link>
            <Link href="/docs/getting-started" className="landing-secondary">
              Start reading <ArrowRight size={16} />
            </Link>
          </div>
          <p>One ordinary payment. One exception. A clearer way forward.</p>
        </section>
        <aside className="landing-release page-width">
          <ShieldCheck size={19} />
          <p>
            <strong>Built with explicit boundaries.</strong> The public demo
            cannot move money. Live execution requires configured integrations,
            approved authority, and verified settlement. Protection is
            unavailable until terms and reserve funding are activated.
          </p>
          <Link href="/docs/release-status">
            Release status <ChevronRight size={15} />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
