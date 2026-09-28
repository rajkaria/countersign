# Countersign glossary

Terms in the interface, API and receipts refer to different parts of the payment process. Keeping those meanings separate prevents an approval, transaction or simulation from being mistaken for settlement.

| Term | Meaning |
|---|---|
| Acceptance | An attestation by an allowed customer actor for an exact obligation and agreement version; it can expire or become stale |
| Activity evidence | Evidence that work happened, such as a merged pull request; it does not independently satisfy acceptance |
| Allocation | An amount assigned to an invoice, obligation or coverage liability; reserved and uncertain amounts still consume capacity |
| Atomic units | Integer units of an asset represented as decimal strings; six-decimal USDC uses one million units per USDC |
| Audit event | A record of who performed an application action and what version or object it affected |
| Canonical receipt | A portable record serialized consistently so changes to committed fields can be detected |
| Case | A scoped investigation of a discrepancy with an owner, evidence request and resolution history |
| CCTP | Circle's Cross-Chain Transfer Protocol; Countersign's restricted route separates source burn from destination mint |
| Commitment ceiling | The approved cumulative maximum for an engagement, accounting for paid and pending allocations |
| Coverage allocation | Reserved collateral bound to an exact payment permit and accepted protection terms |
| Decision | A versioned verifier result with action, amount, sources, findings, expiry and executable flag |
| Delegate | Engagement mode permitting eligible execution only within separately installed and verified authority |
| Deployment manifest | A private evidence bundle identifying the reviewed chain, contracts, identities and compatibility/recovery evidence |
| Destination | The verified recipient address and chain, with its own version |
| Destination pending | Source execution is confirmed but matching finalized destination delivery is not yet established |
| Engagement | The approved vendor agreement record with billing model, period, amount, ceiling, acceptance and mode |
| Epoch | On-chain policy generation used to make older authorization invalid after relevant configuration changes |
| Evidence commitment | A digest binding a record to evidence; it does not establish the truth or completeness of the source |
| Finality | The chain confirmation standard used for independent verification; a provider's status alone is insufficient |
| Finding | A specific hold, evidence request or informational result in a decision |
| History reconciliation | Owner-backed classification of observed transfers against documented records and a stated scope |
| Idempotency key | Stable operation identity used to recognize retries of the same action rather than create another effect |
| Invoice | A vendor's payment request matched to an approved obligation; its reference is not the obligation's identity |
| Observe | Read-only analysis without payment preparation or execution authority |
| Obligation | The approved unit of payable work or period; renaming an invoice cannot create more payable capacity |
| Outbox | Durable queued jobs committed before external work, processed with leases and controlled retries |
| Permit | Exact signed EIP-712 authorization binding the payment, versions, recipient, amount, route and limits |
| Policy | Approved spending and cash constraints; application configuration and actual Safe authority are separate |
| Prepare | A mode for creating an explained payment proposal while retaining human transaction approval |
| Protection | A limited, terms-bound compensation design backed by fully reserved liability when activated |
| Recovery required | An operation needs independent investigation before capacity or execution can change |
| Safe | The business's multisignature wallet, whose owners retain their independent signing and recovery rights |
| Settlement | Verified delivery to the intended recipient, asset, chain and amount under the payment's exact constraints |
| Subledger | Append-only balanced financial events supporting reconciliation and export |
| Synthetic demo | Browser-only illustrative records isolated from real-workspace persistence and financial metrics |
| Tenant | One authorized organization/workspace; identifiers never replace membership checks |
| Uncertain | Submission may have occurred but the outcome is not proven; preserve identity and reserved capacity |
| Vendor correction | A proposal submitted through expiring access to one case; it cannot approve payment or change the trusted register |

For step-by-step use, start with [getting started](/docs/getting-started). For exact decision behavior, see [verification](/docs/verification) and [domain invariants](/docs/domain).
