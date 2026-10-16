"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  FileCheck2,
  FileText,
  Fingerprint,
  LockKeyhole,
  Pause,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const scenes = [
  {
    label: "01 · Match",
    title: "The agreement sets the rules.",
    description:
      "The invoice matches the approved monthly retainer. The recipient and payment history check out.",
    state: "Reviewing evidence",
    icon: FileText,
  },
  {
    label: "02 · Review",
    title: "A missing yes. A useful pause.",
    description:
      "Delivery was recorded, but your team's acceptance is missing. This invoice stays held until an authorized person accepts it.",
    state: "Acceptance required",
    icon: Pause,
  },
  {
    label: "03 · Record",
    title: "Every decision leaves a trail.",
    description:
      "After acceptance, re-verification can produce an eligible proposal. Eligibility alone does not authorize or settle a payment.",
    state: "Ready for re-verification",
    icon: Fingerprint,
  },
];

export function PaymentStory() {
  const [active, setActive] = useState(1);
  const scene = scenes[active];
  const Icon = scene.icon;
  return (
    <div className="payment-story">
      <div className="story-topline">
        <span>
          <span className="story-dot" /> THE COUNTERSIGN CHECK
        </span>
        <span>SAMPLE / 001</span>
      </div>
      <div className="story-sources" aria-hidden="true">
        <span>
          <FileText size={16} /> Agreement
        </span>
        <span>
          <FileCheck2 size={16} /> Delivery
        </span>
        <span>
          <ShieldCheck size={16} /> Your policy
        </span>
      </div>
      <div className="story-connectors" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>
          <ArrowDown size={16} />
        </span>
      </div>
      <div className="story-invoice">
        <div className="story-invoice-head">
          <span className="story-avatar">
            N<span>↗</span>
          </span>
          <div>
            <strong>Northstar Studio</strong>
            <span>September design retainer</span>
          </div>
          <span className="story-currency">USDC</span>
        </div>
        <div className="story-total">
          <strong>
            3,200<span>.00</span>
          </strong>
          <span>
            Due October 1<br />
            Invoice NS-024
          </span>
        </div>
        <div className="story-checks">
          <p>
            <Check size={15} /> Approved agreement <span>Matched</span>
          </p>
          <p>
            <Check size={15} /> Recipient & history <span>Checked</span>
          </p>
          <p className={active === 2 ? "" : "check-pending"}>
            {active === 2 ? <Check size={15} /> : <Pause size={15} />} Team
            acceptance{" "}
            <span>{active === 2 ? "Recorded in example" : "Missing"}</span>
          </p>
        </div>
        <div
          className={`story-result story-result-${active}`}
          key={active}
          role="status"
        >
          <Icon size={20} />
          <div>
            <strong>{scene.state}</strong>
            <span>
              {active === 2
                ? "A new decision, with the evidence attached."
                : "Nothing moves outside your rules."}
            </span>
          </div>
          <LockKeyhole size={16} />
        </div>
      </div>
      <div
        className="story-tabs"
        role="tablist"
        aria-label="Illustrative invoice review steps"
      >
        {scenes.map((s, i) => (
          <button
            key={s.label}
            id={`story-tab-${i}`}
            role="tab"
            aria-selected={active === i}
            aria-controls="story-panel"
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (active + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setActive(next);
                document.getElementById(`story-tab-${next}`)?.focus();
              }
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        className="story-explanation"
        id="story-panel"
        role="tabpanel"
        aria-labelledby={`story-tab-${active}`}
      >
        <strong>{scene.title}</strong>
        <p>{scene.description}</p>
      </div>
      <Link href="/review" className="story-link">
        Try the guided walkthrough <ArrowUpRight size={15} />
      </Link>
      <p className="story-disclaimer">
        ILLUSTRATIVE WORKFLOW · SYNTHETIC DATA · NO FUNDS MOVE
      </p>
    </div>
  );
}
