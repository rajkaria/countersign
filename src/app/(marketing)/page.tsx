import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  FileText,
  ShieldCheck,
  Fingerprint,
  LockKeyhole,
  ScanLine,
  CirclePause,
  ChevronRight,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/brand";
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero page-width">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> THE PAYMENT CONTROLLER FOR CRYPTO
              TEAMS
            </div>
            <h1>
              Every payment.
              <br />A second look.
            </h1>
            <p className="hero-description">
              What you agreed. What was delivered.
              <br />
              What you already paid.
              <br />
              <strong>Countersign connects the dots before money moves.</strong>
            </p>
            <div className="hero-actions">
              <Link className="button" href="/workspace">
                Open the interactive demo <ArrowUpRight size={18} />
              </Link>
              <Link href="/docs/getting-started" className="text-link">
                Start with read-only <ArrowRight size={16} />
              </Link>
            </div>
            <p className="microcopy">
              <LockKeyhole size={13} /> Explore with sample data. No wallet or
              funds required.
            </p>
          </div>
          <div className="hero-visual">
            <div className="visual-caption">
              <span>PAYMENT REVIEW</span>
              <span>01 / 03</span>
            </div>
            <div className="review-card">
              <div className="review-card-top">
                <div className="vendor-avatar">NS</div>
                <div>
                  <strong>Northstar Studio</strong>
                  <span>September design retainer</span>
                </div>
                <span className="badge badge-held">Needs a look</span>
              </div>
              <div className="review-amount">
                $3,200<span>USDC · due Oct 1</span>
              </div>
              <div className="review-check">
                <Check size={16} />
                <span>Matches approved agreement</span>
                <span>$3,200 / month</span>
              </div>
              <div className="review-check">
                <Check size={16} />
                <span>Approved recipient</span>
                <span>0x71…4f2a</span>
              </div>
              <div className="review-check">
                <Check size={16} />
                <span>No previous payment</span>
                <span>Verified</span>
              </div>
              <div className="review-exception">
                <CirclePause size={19} />
                <div>
                  <strong>One thing before this moves.</strong>
                  <p>
                    Delivery is recorded. Acceptance from your team is still
                    missing.
                  </p>
                </div>
              </div>
              <Link href="/workspace/cases" className="review-cta">
                Review the evidence <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <ShieldCheck size={21} />
              </span>
              <div>
                <strong>Your rules. Always.</strong>
                <p>The agent cannot expand its own authority.</p>
              </div>
            </div>
            <div className="sample-label">
              ILLUSTRATIVE CASE · SYNTHETIC DATA
            </div>
          </div>
        </section>
        <div className="principle-strip">
          <div className="page-width">
            <span>
              <CheckCheck size={19} /> Agreement-aware
            </span>
            <span>
              <ShieldCheck size={19} /> Bounded by your Safe
            </span>
            <span>
              <Fingerprint size={19} /> Evidence with every decision
            </span>
            <span>
              <LockKeyhole size={19} /> Human control, preserved
            </span>
          </div>
        </div>
        <section className="section page-width" id="workflow">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                LESS RECONSTRUCTION. MORE CONFIDENCE.
              </div>
              <h2>
                From scattered context
                <br />
                to a clear next step.
              </h2>
            </div>
            <p>
              The invoice is only part of the story. Bring the agreement,
              acceptance, and payment history into the same review.
            </p>
          </div>
          <div className="workflow-grid">
            <article>
              <span className="step-number">01</span>
              <div className="line-art">
                <FileText size={38} strokeWidth={1} />
                <span />
                <ScanLine size={38} strokeWidth={1} />
              </div>
              <h3>Know what you owe.</h3>
              <p>
                Match invoices to versioned agreements and approved vendor
                details. Spot missing acceptance, changed destinations, and
                duplicate obligations.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <div className="mini-decision">
                <span>
                  Terms match <Check size={13} />
                </span>
                <span>
                  Delivery accepted <Check size={13} />
                </span>
                <span className="mini-held">
                  Recipient changed <CirclePause size={13} />
                </span>
              </div>
              <h3>Resolve what matters.</h3>
              <p>
                See exactly what differs, why it matters, and what will resolve
                it. A new piece of evidence creates a new decision you can
                inspect.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <div className="mini-ledger">
                <div>
                  <span>Confirmed cash</span>
                  <strong>$18,500</strong>
                </div>
                <div>
                  <span>Protected commitments</span>
                  <strong>− $8,000</strong>
                </div>
                <div>
                  <span>Available for this plan</span>
                  <strong>$10,500</strong>
                </div>
              </div>
              <h3>Move with a plan.</h3>
              <p>
                Schedule eligible payments against confirmed cash and
                commitments. Keep a connected record from approval through
                destination settlement.
              </p>
            </article>
          </div>
        </section>
        <section className="control-section" id="control">
          <div className="page-width control-grid">
            <div>
              <div className="eyebrow">AUTONOMY YOU CAN DRAW A LINE AROUND</div>
              <h2>
                Start with visibility.
                <br />
                Delegate deliberately.
              </h2>
              <p>
                Your Safe stays yours. Choose the level of authority per
                engagement. The agent works inside approved limits, while owners
                retain independent pause and recovery.
              </p>
              <Link href="/docs/security" className="text-link">
                Understand the authority model <ArrowUpRight size={17} />
              </Link>
              <div className="control-footnote">
                <ShieldCheck size={18} /> No unrestricted agent owner. No
                reduced human threshold.
              </div>
            </div>
            <div className="authority-stages">
              <div>
                <span>01</span>
                <h3>Observe</h3>
                <p>
                  Connect records. Find discrepancies.
                  <br />
                  No execution authority.
                </p>
                <span className="stage-tag">START HERE</span>
              </div>
              <div>
                <span>02</span>
                <h3>Prepare</h3>
                <p>
                  Review payment proposals.
                  <br />
                  Your team authorizes execution.
                </p>
              </div>
              <div>
                <span>03</span>
                <h3>Delegate</h3>
                <p>
                  Approve a bounded policy.
                  <br />
                  Limits enforced by the Safe module.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="section page-width evidence-section">
          <div>
            <div className="eyebrow">AN ANSWER YOU CAN FOLLOW</div>
            <h2>
              “Why this payment?”
              <br />
              Should have a good answer.
            </h2>
            <p>
              A decision is useful when you can trace it. Inspect the approved
              terms, the acceptance, the exact constraints, and the settlement
              record. Export a portable receipt and verify its integrity.
            </p>
            <Link href="/workspace/activity" className="text-link">
              Inspect a sample receipt <ArrowRight size={16} />
            </Link>
          </div>
          <div className="receipt-preview">
            <div>
              <Fingerprint size={23} />
              <span>DECISION RECEIPT</span>
              <span className="badge">SAMPLE</span>
            </div>
            <dl>
              <div>
                <dt>Obligation</dt>
                <dd>PS-039 · Security review</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd className="green-text">Verified & reconciled</dd>
              </div>
              <div>
                <dt>Agreement</dt>
                <dd>
                  Version 1 <Check size={13} />
                </dd>
              </div>
              <div>
                <dt>Acceptance</dt>
                <dd>
                  Authorized operator <Check size={13} />
                </dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>Synthetic sandbox</dd>
              </div>
            </dl>
            <div className="receipt-bottom">
              <span>Portable. Inspectable. Yours.</span>
              <ArrowUpRight size={17} />
            </div>
          </div>
        </section>
        <section className="cta-section page-width">
          <div className="eyebrow">SEE THE WHOLE STORY</div>
          <h2>
            Your next payment
            <br />
            deserves a second look.
          </h2>
          <Link href="/workspace" className="button">
            Explore Countersign <ArrowUpRight size={18} />
          </Link>
          <p>Try an ordinary payment, an exception, and a recovery scenario.</p>
        </section>
        <section className="release-note page-width">
          <ShieldCheck size={20} />
          <p>
            <strong>Built with explicit boundaries.</strong> The public demo
            uses synthetic records and cannot move money. Live execution
            requires configured integrations, approved delegation, and verified
            settlement. Protection is unavailable until terms and reserve
            funding are activated.
          </p>
          <Link href="/docs/release-status">
            Release status <ChevronRight size={16} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
