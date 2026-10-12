import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ReviewerWalkthrough } from "@/components/reviewer-walkthrough";
import { ArrowUpRight, BookOpen, Layers3, ShieldCheck } from "lucide-react";
import "./review.css";
export const metadata: Metadata = { title: "Review Countersign", description: "A reproducible walkthrough of agreement-aware payments, implemented software and explicit live-evidence limits.", alternates: { canonical: "/review" } };
export default function Review() {
  return <div className="review-page"><header className="review-header"><Brand /><nav aria-label="Reviewer navigation"><Link href="/docs/reviewer-guide">Review guide</Link><Link href="/workspace">Full demo <ArrowUpRight size={15} /></Link></nav></header><main id="main">
    <section className="review-hero"><div><p className="review-kicker">COUNTERSIGN / PRODUCT WALKTHROUGH</p><h1>The invoice is only<br /><em>half the story.</em></h1><p className="review-intro">Connect what was agreed, what was accepted and what was already paid. Give the next payment a reason you can inspect.</p></div><aside><span className="review-proof-tag">SYNTHETIC DEMONSTRATION</span><p>Working production verification logic, isolated sample inputs.</p><p>Real usage, Circle settlement and live model results require separate evidence.</p><Link href="/docs/release-status">Read the exact release status <ArrowUpRight size={15} /></Link></aside></section>
    <ReviewerWalkthrough />
    <section className="review-proof-grid" aria-label="Implementation and evidence"><article><Layers3 aria-hidden="true" /><h2>Where the agent helps</h2><p>Extract complete originals, organize cited evidence, explain missing approval and propose a bounded next step. Approved terms, acceptance and payment authority stay independently verified.</p><Link href="/workspace">Review Northstar source and proposal <ArrowUpRight size={15} /></Link></article><article><ShieldCheck aria-hidden="true" /><h2>Where the money stops</h2><p>Observe → Prepare → Delegate, version-bound permits, shared-Safe capacity and stable operation identities. An unknown outcome stays unresolved; source confirmation cannot stand in for destination settlement.</p><Link href="/workspace/recovery">Try the recovery lab <ArrowUpRight size={15} /></Link></article><article><BookOpen aria-hidden="true" /><h2>Verify the scope yourself</h2><p>Read the source walkthrough, API and runtime activation requirements. Tests and fixture traces demonstrate implementation behavior. Customer utility and actual Circle compatibility need consented live proof.</p><Link href="/docs/reviewer-guide">Open the reviewer guide <ArrowUpRight size={15} /></Link></article></section>
    <footer className="review-footer"><p>Model proposals cannot release money. Live financial execution is not activated.</p><Link href="/">Countersign home</Link></footer>
  </main></div>;
}
