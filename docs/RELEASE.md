# Release verification and activation

Release date: 6 October 2026. Software version: 0.2.0. Private source: https://github.com/rajkaria/countersign. Web deployment: https://countersign-jet.vercel.app.

## Actual deployment

The landing page, documentation and isolated synthetic workspace are deployed. The authenticated workspace and APIs are implemented, but the production deployment has no dedicated database configured. It deliberately returns a configuration error rather than storing real data ephemerally. No Circle wallet, deployed Safe module, destination relayer, funded reserve or customer payment has been activated. This is a deployed software release with financial activation gates, not a claim that a production payment service is already operating.

## Acceptance evidence

The following mapping separates software evidence from live acceptance. Local mocks, synthetic examples and PGlite do not establish real business usage or chain/provider compatibility.

| Scenario | Implemented evidence | External verification still required |
| --- | --- | --- |
| A01 Read-only intake | Tenant records, CSV dry-run/import, documents, read-only Safe adapter, console | Dedicated database and pilot invoice |
| A02 Extraction and activation | Complete-source agreement/invoice proposals with binary transport and provenance; owner-only versioned activation | Model credentials and consented source document |
| A03 Routine obligation | Verifier, standing worker, exact permits, reconciliation, ledger/export | Circle/Safe compatibility, deployed controls, authorized funds |
| A04 Renamed duplicate | Semantic obligation identity and allocation checks | Pilot replay |
| A05 Recurrence/amendment | Period identity, effective dates, versioned owner amendments | Consented recurring business sample |
| A06 Missing acceptance | Allowlisted customer acceptance, stale/version checks and holds | Customer acceptor validation |
| A07 Destination attack | Trusted register, two-stage fresh-auth change workflow, invalidation | Independent reviewer practice |
| A08 Partial payment | Exact hourly quantities and partial requests, remaining amount, same-amount retry identity and cumulative caps | Real partial settlement and bookkeeping sign-off |
| A09 Competing obligations | Shared-Safe confirmed-cash planner, pending allocations and reserves | Current Safe balances and approved reserves |
| A10 New revenue | Periodic finalized observation refresh and plan reassessment | Live confirmed inflow |
| A11 Parallel attempts | Database uniqueness/locks/leases and on-chain replay/caps | Deployment-specific contention test |
| A12 Uncertain broadcast | Persisted operation IDs, uncertain/recovery states, same-identity lookup | Provider timeout/recovery exercise |
| A13 Cross-chain finality | Exact CCTP binding, durable relay, destination mint verification | Supported route/wallet, source and destination transactions |
| A14 Stale authority | Record versions, permit hashes, contract epoch/replay checks | On-chain policy update/revocation exercise |
| A15 Manual payment | Owner-backed history reconciliation and explicit invoice allocation | Customer history scope and source evidence |
| A16 Outage/recovery | Fail-closed gates, independent Safe controls, recovery lab/runbook | Independent owner drill with deployed controls |
| A17 Isolation | Membership predicates, scoped vendor tokens, encrypted tenant documents | Production access and restore review |
| A18 Reserve/claims | Fully collateralized liability accounting, pending claims, duplicate guards | Capital, legal terms, independent reviewer, deployment |
| A19 Receipt tamper | Canonical receipt verifier, exact bound fields and signature checks | Trusted external checkpoint and chain readback |
| A20 Demo separation | Separate synthetic browser sandbox and authenticated PostgreSQL APIs | Passed in deployed browser checks |
| A21 Accounting | Integer units, balanced/reversal events, period packs with unresolved/unattributed settlement warnings, escaped CSV and references | Bookkeeper approval and real bank/chain reconciliation |
| A22 Human override | Scoped owner hold/clear, version/audit record, fresh sign-in, coverage notice | Customer recovery training |

## Gate assessment

G1–G4 remain externally gated by actual pilot data, dedicated persistence/worker deployment, Circle compatibility, contract installation, owner recovery practice and authorized settlement. G5 software paths are implemented; its real destination route and coverage require activation. G6 has synthetic/local evaluation and internal security review, with no independent customer timing, repeat usage or external audit. G7 has a deployed logged-out experience, private repository and detailed documentation; public-source permission, event video and submission are not established. G8 has operations/recovery instructions, but funded reserves, operators and active monitoring must be provisioned.

## Required owner actions

1. Select or provision a dedicated PostgreSQL database. Set DATABASE_URL, APP_ORIGIN and a securely backed-up DOCUMENT_ENCRYPTION_KEY; run migrations; test tenant login and restore. No unrelated database was reused.
2. Provision Circle Agent Wallet profiles and provider credentials outside chat. Install and review the exact Safe module and destination route on testnet, exercise revocation/recovery, then record genuine deployment evidence in the manifest. Deploy the persistent worker with separate verifier/executor custody.
3. Approve explicit test allocations before funding or payments. For protection, approve terms, fully fund maximum reserved liability and appoint an independent reviewer before activation.
4. Obtain customer consent and actual invoices/acceptance, run the existing-workflow/rules/rules-plus-agent comparison, and have a bookkeeper review exports. Synthetic records are excluded from traction claims.
5. Independently review money-moving contracts and operational recovery before real use. If entering an event requiring public source, decide the license and repository visibility separately; no source was made public and no submission was sent.

See deployment.md, contracts.md, integrations.md, relay.md, operations.md and security-review.md for exact setup and verification procedures.

## October 6 expansion

The functional console now exposes versioned corrections, acceptance revocation, exact hourly and partial preparation, payment details/receipts, shared-Safe cash planning, history reconciliation and scoped member/capability administration. The operations desk adds currency-separated settled/committed/outstanding balances, exception owners/deadlines, quiet-hour preferences, reminder previews and accounting period exports. Case resolution cannot authorize a payment. Unknown network effects retain reservations.

Redacted activation diagnostics, explicit read-only probes, five migrations, separate host templates, restore fingerprints and an operations-only reminder worker are supplied. Reminder sends require explicit global configuration plus workspace opt-in. Persisted unknown sends are never blindly retried. Containers/local Compose are templates; Docker was unavailable here, so no container build/hosting is claimed.

## Verified checks

On 6 October 2026, Node 22 verification passed TypeScript, ESLint, 199 application tests across 26 files, 32 Foundry tests and the production Next.js 16.3.8 build. Foundry includes three 512-run fuzz tests and two 128-run stateful invariants with 8,192 calls each. Boundary and whitespace checks passed.

Twenty-two desktop/mobile Playwright cases cover public navigation and all 31 handbook guides, anonymous API boundaries, keyboard review, search/raw/LLM parity, isolated operations preferences/cases/exports, versioned hourly/partial retry payloads, invoice-extraction provenance, one-time capability clearing, logout and late-tenant response isolation. Console transports are explicitly synthetic fixtures; these tests do not establish a live database, model call or financial compatibility.

Automated WCAG 2A/AA/2.1AA scans found no violations in the new operations demo at 1440, 390 and 320 pixels, with no horizontal page overflow. This is scoped automated evidence, not accessibility certification.

Production dependency audit reports zero findings. The full audit retains five high package entries from one unpatched development dependency advisory in the braces/ESLint glob chain. Worker templates physically install that chain, with no observed worker/application input path in the scoped review. See security-review.md for reachability and limitations.

These checks concern implemented software and isolated fixtures. They do not substitute for the external activation steps above.

## Hosting and CI readback

The released public landing/docs/demo and private console/API software are deployed to the existing alias. Health is expected to report version 0.2.0 with workspaceConfigured=false and executionEnabled=false until owner setup; readiness deliberately returns 503 without dedicated persistence. No database, wallet, funding, contract or financial worker activation was performed during this release. The exact deployment readback is retained in the private workspace handoff.

GitHub Actions previously failed before runner startup because of account payment/spending limits. The new release run is inspected separately; local test success is never substituted for a hosted CI run. Resolve Billing & plans and rerun Verify when that account gate persists. No billing settings were changed.
