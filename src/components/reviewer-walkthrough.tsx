"use client";
import { useState, useId, type FormEvent } from "react";
import {
  ArrowRight,
  Download,
  RotateCcw,
  FileCheck2,
  Fingerprint,
  CirclePause,
} from "lucide-react";
import {
  reviewerCases,
  reviewerTrace,
  reviewerClarificationTrace,
  type ReviewerCase,
  type ReviewerAnswer,
} from "@/lib/reviewer";
import { formatUnits as formatAtomic } from "@/lib/domain/money";

export function ReviewerWalkthrough() {
  const [scenario, setScenario] = useState<ReviewerCase>("acceptance");
  const [changed, setChanged] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [answer, setAnswer] = useState<ReviewerAnswer | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const item = reviewerCases.find((c) => c.id === scenario)!;
  const clarification = reviewerClarificationTrace(answer ?? undefined);
  const originalTrace = reviewerTrace(scenario, changed);
  const trace =
    scenario === "acceptance"
      ? {
          ...originalTrace,
          changed: answer !== null,
          input: clarification.after?.input ?? clarification.frozen.input,
          decision:
            clarification.after?.decision ?? clarification.rules.decision,
          clarification,
        }
      : originalTrace;
  const { input, decision } = trace;
  const latestAcceptance = input.acceptances.at(-1)!;
  const caseChanged = scenario === "acceptance" ? answer !== null : changed;
  function reset() {
    setChanged(false);
    setAnswer(null);
    setResetKey((key) => key + 1);
  }
  function select(id: ReviewerCase) {
    setScenario(id);
    reset();
    setShowInput(false);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `countersign-synthetic-${scenario}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="review-lab"
      aria-label="Reproducible synthetic walkthrough"
    >
      <div
        className="review-case-picker"
        aria-label="Choose a synthetic scenario"
      >
        {reviewerCases.map((c, i) => (
          <button
            key={c.id}
            aria-pressed={scenario === c.id}
            onClick={() => select(c.id)}
          >
            <span>0{i + 1}</span>
            {c.title}
          </button>
        ))}
      </div>
      <div className="review-case-body">
        <div className="review-case-heading">
          <p className="review-kicker">PRODUCTION REDUCER · SYNTHETIC INPUT</p>
          <h2>{item.title}</h2>
          <p>{item.subtitle}</p>
        </div>
        <div className="review-flow">
          <article>
            <FileCheck2 aria-hidden="true" />
            <p className="review-kicker">01 / THE AGREEMENT</p>
            <h3>{formatAtomic(input.engagement.amount, 6)} USDC</h3>
            <p>Retainer · version {input.engagement.version}</p>
            <dl>
              <dt>Acceptance required</dt>
              <dd>Named customer acceptor</dd>
              <dt>Partial payments</dt>
              <dd>
                {input.engagement.partialPayments ? "Allowed" : "Not allowed"}
              </dd>
              <dt>Destination</dt>
              <dd>
                Verified version {input.engagement.destinations[0].version}
              </dd>
            </dl>
          </article>
          <article>
            <Fingerprint aria-hidden="true" />
            <p className="review-kicker">02 / THE EVIDENCE</p>
            <h3>
              {latestAcceptance.kind === "activity"
                ? "Activity only"
                : `Acceptance v${latestAcceptance.engagementVersion}`}
            </h3>
            <p>{input.invoice.reference}</p>
            <dl>
              <dt>Obligation</dt>
              <dd>{input.invoice.obligationId}</dd>
              <dt>Responder</dt>
              <dd>{latestAcceptance.actorId}</dd>
              <dt>Existing allocations</dt>
              <dd>
                {formatAtomic(
                  input.allocations
                    .reduce((n, a) => n + BigInt(a.amount), 0n)
                    .toString(),
                  6,
                )}{" "}
                USDC
              </dd>
              <dt>Requested amount</dt>
              <dd>
                {formatAtomic(input.requestedAmount ?? input.invoice.amount, 6)}{" "}
                USDC
              </dd>
            </dl>
          </article>
          <article
            className={`review-decision ${decision.action === "PAY" ? "eligible" : "held"}`}
          >
            <CirclePause aria-hidden="true" />
            <p className="review-kicker">03 / THE VERIFIER</p>
            <h3>{decision.action}</h3>
            <p>
              {scenario === "uncertain" && changed
                ? "Reconcile the original operation. A new submission is rejected."
                : decision.reason}
            </p>
            <ul>
              {decision.findings.map((f) => (
                <li key={f.code}>{f.code}</li>
              ))}
            </ul>
            <small>Fixture eligibility creates no payment authority.</small>
          </article>
        </div>
        {scenario === "acceptance" && (
          <ClarificationComparison
            key={resetKey}
            trace={clarification}
            onSubmit={setAnswer}
            onDraftChange={() => setAnswer(null)}
          />
        )}
        <div className="review-lab-actions">
          {scenario !== "acceptance" && (
            <button
              className="button"
              onClick={() => setChanged(true)}
              disabled={changed}
            >
              {changed ? "Synthetic change applied" : item.change}
              <ArrowRight size={17} />
            </button>
          )}
          <button
            className="review-text-button"
            onClick={reset}
            disabled={!caseChanged}
          >
            <RotateCcw size={15} /> Reset case
          </button>
          <button className="review-text-button" onClick={download}>
            <Download size={15} /> Download fixture trace
          </button>
        </div>
        {trace.execution && (
          <pre
            className="review-execution"
            aria-label="Execution reducer result"
          >
            {trace.execution}
          </pre>
        )}
        <button
          className="review-source-toggle"
          aria-expanded={showInput}
          onClick={() => setShowInput(!showInput)}
        >
          {showInput ? "Hide" : "Inspect"} exact verifier input & output
        </button>
        {showInput && (
          <pre className="review-source" tabIndex={0}>
            {JSON.stringify(trace, null, 2)}
          </pre>
        )}
        <p className="review-fixture-note">
          Fixed snapshot: 28 September 2026. Addresses, acceptances and
          allocations are fictional. Buttons change this browser fixture only.
          No model, wallet, provider or database is contacted.
        </p>
      </div>
    </section>
  );
}

function ClarificationComparison({
  trace,
  onSubmit,
  onDraftChange,
}: {
  trace: ReturnType<typeof reviewerClarificationTrace>;
  onSubmit: (answer: ReviewerAnswer) => void;
  onDraftChange: () => void;
}) {
  const formId = useId();
  const [actorId, setActorId] = useState("owner-1");
  const [response, setResponse] =
    useState<ReviewerAnswer["response"]>("activity-only");
  const [version, setVersion] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showContext, setShowContext] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      contextCommitment: trace.frozen.contextCommitment,
      actorId,
      engagementVersion: version,
      obligationId: trace.frozen.input.invoice.obligationId,
      response,
      confirmedSynthetic: acknowledged,
    });
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "countersign-synthetic-clarification.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="review-clarification"
      aria-label="Frozen clarification comparison"
    >
      <div className="review-comparison-heading">
        <p className="review-kicker">SAME CONTEXT / DIFFERENT QUESTION</p>
        <h3>What should the human clarify?</h3>
        <p>
          Both arms start at ASK with the same source text and approved rules.
          No model was executed. The recorded question below is an authored
          fixture, not evidence that a model outperforms rules.
        </p>
      </div>
      <div className="review-comparison-grid">
        <article aria-label="Strong rules baseline">
          <p className="review-kicker">STRONG RULES BASELINE · ASK</p>
          <h4>A specific rules prompt</h4>
          <p>{trace.rules.question}</p>
          <p>
            Names, obligation and version are already known. A rules-based
            operator can obtain a valid answer too.
          </p>
        </article>
        <article aria-label="Recorded clarification proposal">
          <p className="review-kicker">RECORDED PROPOSAL FIXTURE · ASK</p>
          <h4>Connect the delivery note to the clause</h4>
          <p>{trace.agentFixture.proposal.missing[0]}</p>
          <p>{trace.agentFixture.proposal.reason}</p>
          <button
            type="button"
            className="review-text-button"
            onClick={() => setShowContext(true)}
          >
            Inspect cited question sources
          </button>
          <ul>
            {trace.agentFixture.proposal.sourceIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </article>
      </div>
      <details
        open={showContext}
        onToggle={(event) => setShowContext(event.currentTarget.open)}
        className="review-frozen-context"
      >
        <summary>Inspect frozen source context</summary>
        <p>
          The full fictional text and normalized verifier input are committed
          before either arm. The answer is recorded separately afterwards.
        </p>
        {trace.frozen.originals.map((source) => (
          <article key={source.id}>
            <h4>{source.location}</h4>
            <p>{source.text}</p>
            <p>
              Source: <code>{source.id}</code> · Exact text SHA-256:{" "}
              <code>{source.textSha256}</code>
            </p>
          </article>
        ))}
        <pre className="review-source" tabIndex={0}>
          {JSON.stringify(
            { input: trace.frozen.input, evidence: trace.frozen.evidence },
            null,
            2,
          )}
        </pre>
      </details>
      <p className="review-commitment-label">Frozen context commitment</p>
      <code className="review-context-commitment">
        {trace.frozen.contextCommitment}
      </code>
      <form className="review-answer-form" onSubmit={submit}>
        <div>
          <h4>Submit a fictional human answer</h4>
          <p>
            Try delivery-only, an unauthorized responder or the wrong terms
            version. A proposed question cannot supply acceptance. These
            controls simulate identities; they do not authenticate anyone.
          </p>
        </div>
        <div className="review-answer-fields">
          <div>
            <label htmlFor={`${formId}-actor`}>Fictional responder</label>
            <select
              id={`${formId}-actor`}
              value={actorId}
              onChange={(event) => {
                onDraftChange();
                setActorId(event.target.value);
              }}
            >
              <option value="owner-1">
                owner-1 · named authorized acceptor
              </option>
              <option value="vendor-1">
                vendor-1 · not authorized to accept
              </option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-response`}>Fictional answer</label>
            <select
              id={`${formId}-response`}
              value={response}
              onChange={(event) => {
                onDraftChange();
                setResponse(event.target.value as ReviewerAnswer["response"]);
              }}
            >
              <option value="activity-only">
                Delivery update; acceptance not given
              </option>
              <option value="accept">Explicitly accept this obligation</option>
              <option value="decline">
                Decline acceptance; review incomplete
              </option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-version`}>
              Answer applies to agreement version
            </label>
            <select
              id={`${formId}-version`}
              value={version}
              onChange={(event) => {
                onDraftChange();
                setVersion(Number(event.target.value));
              }}
            >
              <option value={1}>Version 1 · current approved terms</option>
              <option value={2}>Version 2 · different terms</option>
            </select>
          </div>
        </div>
        <p>
          Bound obligation:{" "}
          <strong>{trace.frozen.input.invoice.obligationId}</strong>. Amount,
          destination, invoice and policy remain unchanged. Editing an answer
          clears the previous result; submit the new answer to re-verify it.
        </p>
        <label className="review-answer-acknowledgement">
          <input
            type="checkbox"
            required
            checked={acknowledged}
            onChange={(event) => {
              onDraftChange();
              setAcknowledged(event.target.checked);
            }}
          />
          I am submitting a fictional answer; no real identity or payment
          authority is authenticated.
        </label>
        <button className="button" type="submit" disabled={!acknowledged}>
          Submit synthetic answer
          <ArrowRight size={17} />
        </button>
      </form>
      {trace.after && (
        <div className="review-answer-result" role="status">
          <h4>
            Re-verification: {trace.rules.decision.action} →{" "}
            {trace.after.decision.action}
          </h4>
          <p>{trace.after.decision.reason}</p>
          <p>
            Execution: disabled (Observe). PAY means eligible under the
            fixture’s checks; no payment is prepared or signed. Both approaches
            receive this same answer and verifier result.
          </p>
          <p>
            {trace.diff?.resolvedFindings.length
              ? `Resolved: ${trace.diff.resolvedFindings.map((finding) => finding.code).join(", ")}`
              : "The acceptance requirement remains unresolved."}{" "}
            Amount, approved terms and destination are unchanged.
          </p>
          <p>Answer source: {trace.answer?.source.id}</p>
        </div>
      )}
      <p className="review-fixture-note">
        Any model advantage must come from useful contextual questions or
        reduced operator work on held-out originals. The identical final action
        here establishes no measured advantage, time savings or customer
        outcome.
      </p>
      <button type="button" className="review-text-button" onClick={download}>
        <Download size={15} />
        Download clarification trace
      </button>
    </section>
  );
}
