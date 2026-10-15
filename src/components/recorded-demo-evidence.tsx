"use client";
import { ArrowUpRight, Database, Download, FlaskConical, Network } from "lucide-react";
import { recordedDemoEvidence as evidence } from "@/lib/demo-evidence";

export function RecordedDemoEvidence() {
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "countersign-recorded-synthetic-summary.json";
    anchor.click(); URL.revokeObjectURL(url);
  }
  return <section id="recorded-evidence" className="recorded-evidence" aria-label="Recorded demonstration evidence">
    <div className="recorded-heading"><div><p className="review-kicker">RECORDED CHECKS / 16 OCTOBER 2026 IST</p><h2>Past the fixture.</h2><p>Actual services exercised with fictional records. Replay the evidence without an API key or wallet.</p></div><span className="review-proof-tag">RECORDED · SYNTHETIC INPUTS</span></div>
    <div className="recorded-grid">
      <article><FlaskConical aria-hidden="true" /><p className="review-kicker">01 / THE MODEL REQUEST</p><h3>Recorded DeepSeek request</h3><p>Lantern Atlas Studio’s 800 USDC invoice had delivery activity and no current customer acceptance.</p><strong className="recorded-outcome">ASK → ASK</strong><p>The strong rules and DeepSeek both asked for acceptance. The model’s proposal named the missing customer, obligation and terms version.</p><ul>{evidence.model.missingConditions.map(condition => <li key={condition}>{condition}</li>)}</ul><dl><div><dt>Model</dt><dd>{evidence.model.model}</dd></div><div><dt>Tokens</dt><dd>3,971 in · 368 out</dd></div><div><dt>Request latency</dt><dd>2.685 seconds</dd></div></dl><p className="recorded-note">Summary of the recorded proposal, not a new response. Same action does not prove benefit; human effort and savings remain unmeasured.</p></article>
      <article><Network aria-hidden="true" /><p className="review-kicker">02 / THE MANUAL TRANSFER</p><h3>1 USDC delivered on Arc Testnet</h3><p>A separate manual test moved faucet-funded tokens between owner-controlled local wallets.</p><strong className="recorded-outcome">Finalized</strong><p>The transaction succeeded, its transfer event matched and the recipient balance showed exactly 1,000,000 token units.</p><dl><div><dt>Network</dt><dd>Arc Testnet · 5042002</dd></div><div><dt>Receipt block</dt><dd>{evidence.transfer.receiptBlock}</dd></div><div><dt>Token precision</dt><dd>6 decimals</dd></div></dl><a href={`https://explorer.testnet.arc.io/tx/${evidence.transfer.transactionHash}`} target="_blank" rel="noopener noreferrer">View finalized Arc transfer <ArrowUpRight size={15} /></a><p className="recorded-note">Recorded local-wallet test, separate from invoice execution and Circle Agent Wallet integration. No commercial settlement is claimed.</p></article>
      <article><Database aria-hidden="true" /><p className="review-kicker">03 / THE PERSISTED WORKSPACE</p><h3>Originals that survive a restore</h3><p>A dedicated PostgreSQL workspace stores the hypothetical company’s records and encrypted originals.</p><strong className="recorded-outcome">4 originals recovered</strong><p>Authenticated tenant checks and a real logical restore recovered the same plaintext hashes with a key recovered from local Keychain.</p><dl><div><dt>Production HTTP checks</dt><dd>76</dd></div><div><dt>Restored HTTP checks</dt><dd>24</dd></div><div><dt>Financial execution</dt><dd>Disabled</dd></div></dl><p className="recorded-note">Synthetic workspace and local key-recovery checks. Independent audit, off-device recovery and real customer outcomes are not established.</p></article>
    </div>
    <div className="recorded-actions"><button type="button" className="review-text-button" onClick={download}><Download size={16} />Download recorded summary</button><details><summary>Inspect recorded summary</summary><pre className="review-source" tabIndex={0} role="region" aria-label="Recorded evidence summary">{JSON.stringify(evidence, null, 2)}</pre></details></div>
    <p className="review-fixture-note">This section reads a saved summary. It makes no model, wallet, provider or payment request. The interactive verifier above uses separate browser-only fixtures.</p>
  </section>;
}
