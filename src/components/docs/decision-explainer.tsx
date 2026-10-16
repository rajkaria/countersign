"use client";
import { useState } from "react";
import {
  ArrowDown,
  Check,
  CirclePause,
  FileText,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
const examples = [
  {
    label: "Acceptance missing",
    action: "ASK",
    title: "Ask the authorized acceptor.",
    detail:
      "Delivery activity is present, but the required customer acceptance is missing. Obtain acceptance for this exact obligation, then run a new review.",
    checks: [
      "Approved terms match",
      "Destination & history match",
      "Customer acceptance missing",
    ],
    issue: 2,
  },
  {
    label: "Terms changed",
    action: "HOLD",
    title: "Resolve the version mismatch.",
    detail:
      "The invoice refers to an earlier agreement. Review the amendment, bind the invoice to the correct terms and obtain any newly required acceptance before reviewing again.",
    checks: [
      "Invoice references old terms",
      "Destination & history match",
      "Earlier acceptance is insufficient",
    ],
    issue: 0,
  },
  {
    label: "Checks pass",
    action: "PAY",
    title: "Eligible is one step in the process.",
    detail:
      "Assuming all current checks pass, PAY means the supplied release checks pass. In Observe mode this remains analysis. Preparation, authority and actual execution have their own gates.",
    checks: [
      "Approved terms match",
      "Destination & history match",
      "Current acceptance recorded",
    ],
    issue: -1,
  },
];
export function DecisionExplainer() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return (
    <section
      className="decision-explainer"
      aria-label="Illustrative payment decision"
    >
      <div className="explainer-top">
        <span>SEE THE REASONING</span>
        <span>ILLUSTRATIVE · OBSERVE MODE</span>
      </div>
      <div className="explainer-choices" aria-label="Choose an example">
        {examples.map((item, i) => (
          <button
            type="button"
            key={item.label}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="explainer-flow">
        <div className="explainer-input">
          <FileText size={18} />
          <strong>Agreement + invoice</strong>
          <span>800 USDC · monthly retainer</span>
        </div>
        <ArrowDown size={18} aria-hidden="true" />
        <div className="explainer-checks">
          <div>
            <ShieldCheck size={17} />
            <strong>Deterministic checks</strong>
          </div>
          {example.checks.map((check, i) => (
            <p key={check}>
              {i === example.issue || (selected === 1 && i === 2) ? (
                <CirclePause size={14} />
              ) : (
                <Check size={14} />
              )}
              <span>{check}</span>
            </p>
          ))}
        </div>
        <ArrowDown size={18} aria-hidden="true" />
        <div
          className={"explainer-result result-" + example.action.toLowerCase()}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{example.action}</span>
          <div>
            <strong>{example.title}</strong>
            <p>{example.detail}</p>
          </div>
        </div>
      </div>
      <p className="explainer-boundary">
        <LockKeyhole size={14} /> Teaching examples, not a verifier run. No
        wallet, model request or payment is created.
      </p>
    </section>
  );
}
