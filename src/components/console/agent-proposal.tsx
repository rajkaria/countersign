import { formatTime, type WorkspaceRecord } from "./format";
export type AgentProposalResult = {
  id: string;
  decisionId: string;
  proposal: { action: string; reason: string; sourceIds: string[]; missing: string[] };
  provider: string;
  providerResponseId: string;
  model: string;
  promptVersion: string;
  observedAt: string;
  authority: "proposal-only";
  evidence?: { id: string; content: string }[];
  binding: { invoiceId: string; invoiceVersion: number; engagementId: string; engagementVersion: number; policyVersion: number; evaluatedAt: string; validUntil: string };
};
export function AgentProposal({ result, invoice, records, onSelect }: { result: AgentProposalResult; invoice: WorkspaceRecord; records: WorkspaceRecord[]; onSelect: (record: WorkspaceRecord) => void }) {
  const binding = result.binding;
  const engagement = records.find((r) => r.kind === "engagement" && r.id === binding.engagementId);
  const changed = invoice.version !== binding.invoiceVersion || engagement?.version !== binding.engagementVersion;
  return <section className="console-agent-proposal" aria-label="Evidence assistant proposal">
    <p className="eyebrow">PROPOSAL ONLY · {result.provider}</p><h3>{result.proposal.action}: evidence assistant</h3><p>{result.proposal.reason}</p>
    <p>{changed ? "Records have changed since this proposal. Ask for a fresh review." : "This is a recorded snapshot. Run fresh deterministic verification before preparing any payment."} A proposal cannot approve terms, acceptance or execution.</p>
    <h4>Missing evidence & questions</h4>{result.proposal.missing.length ? <ul>{result.proposal.missing.map((question, i) => <li key={i}>{question}</li>)}</ul> : <p>No missing questions were proposed. This is not a verification pass.</p>}
    <h4>Cited sources</h4><p>These links open current source records. Inspect the preserved model snapshot below for the original evidence.</p><ul>{result.proposal.sourceIds.map((id) => { const record = records.find((r) => r.id === id); return <li key={id}>{record ? <button className="text-link" onClick={() => onSelect(record)}>Open current source record: {String(record.body.title ?? record.body.reference ?? record.body.name ?? record.kind)} · {id}</button> : <span>Source {id} is outside the loaded snapshot. Inspect the saved decision before relying on it.</span>}</li>; })}</ul>
    {result.evidence && <details><summary>Inspect preserved model evidence snapshot</summary><pre tabIndex={0}>{JSON.stringify(result.evidence, null, 2)}</pre></details>}
    <dl><dt>Model / prompt</dt><dd>{result.model} / {result.promptVersion}</dd><dt>Provider response</dt><dd>{result.providerResponseId}</dd><dt>Original binding</dt><dd>Invoice v{binding.invoiceVersion} · terms v{binding.engagementVersion} · policy v{binding.policyVersion}</dd><dt>Decision / proposal</dt><dd>{result.decisionId} / {result.id}</dd><dt>Generated / original decision validity</dt><dd>{formatTime(result.observedAt)} / {formatTime(binding.validUntil)}</dd></dl>
  </section>;
}
