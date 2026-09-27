# Release verification and activation

Release date: 28 September 2026. Private source: https://github.com/rajkaria/countersign. Web deployment: https://countersign-jet.vercel.app.

## Actual deployment

The landing page, documentation and isolated synthetic workspace are deployed. The authenticated workspace and APIs are implemented, but the production deployment has no dedicated database configured. It deliberately returns a configuration error rather than storing real data ephemerally. No Circle wallet, deployed Safe module, destination relayer, funded reserve or customer payment has been activated. This is a deployed software release with financial activation gates, not a claim that a production payment service is already operating.

## Acceptance evidence

The following mapping separates software evidence from live acceptance. Local mocks, synthetic examples and PGlite do not establish real business usage or chain/provider compatibility.

| Scenario | Implemented evidence | External verification still required |
| --- | --- | --- |
| A01 Read-only intake | Tenant records, CSV dry-run/import, documents, read-only Safe adapter, console | Dedicated database and pilot invoice |
| A02 Extraction and activation | Source-linked unapproved extraction; owner-only versioned activation | Model credentials and consented source document |
| A03 Routine obligation | Verifier, standing worker, exact permits, reconciliation, ledger/export | Circle/Safe compatibility, deployed controls, authorized funds |
| A04 Renamed duplicate | Semantic obligation identity and allocation checks | Pilot replay |
| A05 Recurrence/amendment | Period identity, effective dates, versioned owner amendments | Consented recurring business sample |
| A06 Missing acceptance | Allowlisted customer acceptance, stale/version checks and holds | Customer acceptor validation |
| A07 Destination attack | Trusted register, two-stage fresh-auth change workflow, invalidation | Independent reviewer practice |
| A08 Partial payment | Approved partial semantics, remaining amounts, cumulative caps | Real partial settlement and bookkeeping sign-off |
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
| A21 Accounting | Integer units, balanced/reversal events, deterministic escaped CSV and references | Bookkeeper approval and real bank/chain reconciliation |
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

## Verified checks

On 28 September 2026, the assembled local gate passed TypeScript, ESLint, 112 application tests across 17 files, 32 Foundry tests, and the production Next.js build. Foundry includes three 512-run fuzz tests and two 128-run stateful invariants (8,192 calls each). Six desktop/mobile Playwright checks passed across public navigation, all handbook routes, unknown-route HTTP 404, mobile overflow and anonymous API boundaries. Dependency audit reported zero vulnerabilities. The repository boundary check found no private strategy, environment secrets or private keys in tracked/publishable files.

These results concern the implemented software and isolated fixtures. They do not substitute for the external activation steps above.

## Hosting and CI readback

The final Vercel deployment passed the same six desktop/mobile checks and the interactive acceptance, persistence, intake, filtering, export, recovery and navigation script against the public HTTPS alias. Health returns HTTP 200 with workspaceConfigured=false and executionEnabled=false. Database readiness returns HTTP 503 as intended until a dedicated database is configured.

GitHub Actions did not start: GitHub reported failed recent account payments or an insufficient spending limit. Resolve account Billing & plans, then rerun the Verify workflow. This is a hosting-account blocker, not a passing CI run. Local and clean-install results are recorded separately.

A fresh remote clone of implementation commit cfb4cff completed npm ci --ignore-scripts and the entire verify gate without local environment files: all 112 application tests, all 32 contracts, TypeScript, lint and production build passed. This confirms checkout reproducibility on the local Node 22/Foundry toolchain; it does not claim that GitHub's blocked runner executed.
