"use client";
import { useState } from "react";
import { ArrowRight, Download, RotateCcw, FileCheck2, Fingerprint, CirclePause } from "lucide-react";
import { reviewerCases, reviewerTrace, type ReviewerCase } from "@/lib/reviewer";
import { formatUnits as formatAtomic } from "@/lib/domain/money";

export function ReviewerWalkthrough() {
  const [scenario, setScenario] = useState<ReviewerCase>("acceptance");
  const [changed, setChanged] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const item = reviewerCases.find((c) => c.id === scenario)!;
  const trace = reviewerTrace(scenario, changed);
  const { input, decision } = trace;
  function select(id: ReviewerCase) { setScenario(id); setChanged(false); setShowInput(false); }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `countersign-synthetic-${scenario}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="review-lab" aria-label="Reproducible synthetic walkthrough">
    <div className="review-case-picker" aria-label="Choose a synthetic scenario">
      {reviewerCases.map((c, i) => <button key={c.id} aria-pressed={scenario === c.id} onClick={() => select(c.id)}><span>0{i + 1}</span>{c.title}</button>)}
    </div>
    <div className="review-case-body">
      <div className="review-case-heading"><p className="review-kicker">PRODUCTION REDUCER · SYNTHETIC INPUT</p><h2>{item.title}</h2><p>{item.subtitle}</p></div>
      <div className="review-flow">
        <article><FileCheck2 aria-hidden="true" /><p className="review-kicker">01 / THE AGREEMENT</p><h3>{formatAtomic(input.engagement.amount, 6)} USDC</h3><p>Retainer · version {input.engagement.version}</p><dl><dt>Acceptance required</dt><dd>Authorized owner</dd><dt>Partial payments</dt><dd>{input.engagement.partialPayments ? "Allowed" : "Not allowed"}</dd><dt>Destination</dt><dd>Verified version {input.engagement.destinations[0].version}</dd></dl></article>
        <article><Fingerprint aria-hidden="true" /><p className="review-kicker">02 / THE EVIDENCE</p><h3>{input.acceptances[0].kind === "activity" ? "Activity only" : `Acceptance v${input.acceptances[0].engagementVersion}`}</h3><p>{input.invoice.reference}</p><dl><dt>Obligation</dt><dd>{input.invoice.obligationId}</dd><dt>Existing allocations</dt><dd>{formatAtomic(input.allocations.reduce((n, a) => n + BigInt(a.amount), 0n).toString(), 6)} USDC</dd><dt>Requested amount</dt><dd>{formatAtomic(input.requestedAmount ?? input.invoice.amount, 6)} USDC</dd></dl></article>
        <article className={`review-decision ${decision.action === "PAY" ? "eligible" : "held"}`}><CirclePause aria-hidden="true" /><p className="review-kicker">03 / THE VERIFIER</p><h3>{decision.action}</h3><p>{scenario === "uncertain" && changed ? "Reconcile the original operation. A new submission is rejected." : decision.reason}</p><ul>{decision.findings.map((f) => <li key={f.code}>{f.code}</li>)}</ul><small>Fixture eligibility creates no payment authority.</small></article>
      </div>
      <div className="review-lab-actions"><button className="button" onClick={() => setChanged(true)} disabled={changed}>{changed ? "Synthetic change applied" : item.change}<ArrowRight size={17} /></button><button className="review-text-button" onClick={() => setChanged(false)} disabled={!changed}><RotateCcw size={15} /> Reset case</button><button className="review-text-button" onClick={download}><Download size={15} /> Download fixture trace</button></div>
      {trace.execution && <pre className="review-execution" aria-label="Execution reducer result">{trace.execution}</pre>}
      <button className="review-source-toggle" aria-expanded={showInput} onClick={() => setShowInput(!showInput)}>{showInput ? "Hide" : "Inspect"} exact verifier input & output</button>
      {showInput && <pre className="review-source" tabIndex={0}>{JSON.stringify(trace, null, 2)}</pre>}
      <p className="review-fixture-note">Fixed snapshot: 28 September 2026. Addresses, acceptances and allocations are fictional. Buttons change this browser fixture only. No model, wallet, provider or database is contacted.</p>
    </div>
  </section>;
}
