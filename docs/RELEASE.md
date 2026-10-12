# Release verification and activation

Release date: 13 October 2026. Software version: 0.4.0. Private source: https://github.com/rajkaria/countersign. Web deployment: https://countersign-jet.vercel.app.

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

G1–G4 remain externally gated by actual pilot data, dedicated persistence/worker deployment, Circle compatibility, contract installation, owner recovery practice and authorized settlement. G5 software paths are implemented; its real destination route and coverage require activation. G6 has synthetic/local evaluation and internal security review, with no independent customer timing, repeat usage or external audit. G7 has a deployed logged-out experience, private repository and detailed documentation; public-source permission, approved public video hosting and submission are not established. G8 has operations/recovery instructions, but funded reserves, operators and active monitoring must be provisioned.

## Required owner actions

1. Select or provision a dedicated PostgreSQL database. Set DATABASE_URL, APP_ORIGIN and a securely backed-up DOCUMENT_ENCRYPTION_KEY; run migrations; test tenant login and restore. No unrelated database was reused.
2. Provision Circle Agent Wallet profiles and provider credentials outside chat. Install and review the exact Safe module and destination route on testnet, exercise revocation/recovery, then record genuine deployment evidence in the manifest. Deploy the persistent worker with separate verifier/executor custody.
3. Approve explicit test allocations before funding or payments. For protection, approve terms, fully fund maximum reserved liability and appoint an independent reviewer before activation.
4. Obtain customer consent and actual invoices/acceptance, run the existing-workflow/rules/rules-plus-agent comparison, and have a bookkeeper review exports. Synthetic records are excluded from traction claims.
5. Independently review money-moving contracts and operational recovery before real use. If entering an event requiring public source, decide the license and repository visibility separately; no source was made public and no submission was sent.

See deployment.md, contracts.md, integrations.md, relay.md, operations.md and security-review.md for exact setup and verification procedures.

The financial provider runtime also has an unresolved dependency gate: its Circle CLI lock retains two high and seven low audit package entries from unpatched cryptographic dependency advisories. The strict provider audit fails without suppression. Keep financial execution disabled until a reviewed provider fix or independently reviewed resolution clears this gate. The web and independent operations runtime production audits report zero findings at the recorded check.

## October 13 final submission pass

Version 0.4.0 adds `/review`, a reproducible unauthenticated walkthrough of acceptance, term corrections, exact partials, semantic duplicates and retained uncertain operations. Downloadable traces contain production-verifier inputs/output and are labeled synthetic. The full demo uses production planning with explicit fixture balances, preserves USD/USDC identity and dates, and holds added invoices without invented approved sources.

The console exposes proposal-only questions, current source citations, preserved model evidence snapshots and model/prompt/response provenance. Evidence comes from the exact verification transaction; membership is revalidated before persistence. The result retains original invoice/terms/policy binding and is never current execution authority.

Workers recheck cached deployment review expiry before new submission, including after delayed wallet discovery. Reconciliation-only identity loading retains recovery after review expiry/restart. Arc USDC observation uses the native system stream conservatively; fractional debits/unsupported historical windows hold automatic reconciliation. A second outgoing effect cannot reuse one payment proof. Actual Circle SCA destination relay compatibility is not established by the direct-envelope check and remains gated. See contracts/security-review notes.

A privately retained narrated/captioned screen recording is 176.890 seconds, 1920×1080 at 30fps. Its persistent synthetic label, source, transcript and export verification are supplied. No video upload, live model, customer or Circle proof is inferred.

## Earlier October 13 completion

Owners have a console **Setup** view with redacted configuration, original-record steps, a database-only readback and separate external financial prerequisites. Public readiness verifies the exact five-migration registry and expected security-control columns; a reachable but unmigrated database cannot pass. The logged-out console explains infrastructure setup and links to the isolated demo.

Operations prioritizes uncertain payments, then exceptions and due obligations. Queue and reminder links open the authorized invoice/case or original payment, including retained records outside the bounded snapshot. Evidence links expose actual available sources. Same-console navigation, refresh and failed detail loads clear or preserve the correct selection without stale payment actions. Notices display exact readable amounts, currencies, due dates and scoped review links; delivery still requires explicit configuration and opt-in.

The portable pilot kit creates empty private templates, freezes salted source snapshots and records the existing-workflow/rules/rules-plus-agent comparison. It checks supplied consent references and revocation, actual timing, exact asset amounts, cohort separation and outcome consistency. It makes no network requests or invented customer results. Source authenticity, consent authority, independent review and bookkeeper sign-off remain external.

Workers now have separate bundled entrypoints and minimal dedicated production locks. Final images run as nonroot and exclude web/framework, compiler/lint/test packages and the development glob advisory chain. Circle CLI is present only in the financial image. Actual final-image checks are separate from the strict provider audit. Images are not provisioned wallets, hosted persistent workers or compatibility proof.

## October 6 expansion

The functional console now exposes versioned corrections, acceptance revocation, exact hourly and partial preparation, payment details/receipts, shared-Safe cash planning, history reconciliation and scoped member/capability administration. The operations desk adds currency-separated settled/committed/outstanding balances, exception owners/deadlines, quiet-hour preferences, reminder previews and accounting period exports. Case resolution cannot authorize a payment. Unknown network effects retain reservations.

Redacted activation diagnostics, explicit read-only probes, five migrations, separate host templates, restore fingerprints and an operations-only reminder worker are supplied. Reminder sends require explicit global configuration plus workspace opt-in. Persisted unknown sends are never blindly retried. Docker remains unavailable locally; hosted build/smoke evidence is assessed separately below. No persistent worker hosting is claimed.

## Verified checks

On 13 October 2026, Node 22 verification passed TypeScript, ESLint, 257 application tests across 34 files, 32 Foundry tests and the production Next.js 16.3.8 build. Foundry includes three 512-run fuzz tests and two 128-run stateful invariants with 8,192 calls each. Boundary and whitespace checks passed. Four dedicated worker packaging tests pass, including bundled entrypoint startup and dependency separation.

Forty-four desktop/mobile Playwright cases pass locally. They cover public navigation and all 32 handbook guides, anonymous API boundaries, keyboard review, search/raw/LLM parity, isolated operations preferences/cases/exports, versioned hourly/partial retry payloads, invoice-extraction provenance, one-time capability clearing, logout and late-tenant response isolation. New cases also cover reviewer trace/downloads, exact demo currency/dates/unapproved sources, recorded proposal/source inspection and current/stale model bindings. Console transports are explicitly synthetic fixtures; these tests do not establish a live database, model call or financial compatibility.

Reviewer, reviewer handbook and settled landing states pass scoped automated WCAG 2A/AA/2.1AA and overflow checks at 1440, 390 and 320 pixels using reduced-motion review. Initial opacity animations can yield transient contrast findings before settling. The October 6 operations demo passed scoped automated WCAG 2A/AA/2.1AA and overflow checks at 1440, 390 and 320 pixels. The new setup view has desktop/mobile overflow regression coverage. Neither establishes comprehensive accessibility certification.

Web production dependency audit reports zero findings. The full web-development audit retains five high package entries from one unpatched braces/ESLint glob advisory. The isolated final workers exclude that chain; their common production runtime has zero findings. The financial-only Circle dependency audit separately retains nine entries (two high, seven low). See security-review.md for source-path review and limitations; the overall dependency audit and CI are not described as clean.

These checks concern implemented software and isolated fixtures. They do not substitute for the external activation steps above.

## Hosting and CI readback

The 0.4.0 implementation [Verify run](https://github.com/rajkaria/countersign/actions/runs/38305469199) succeeds at 1392c9c; the presentation revision [Verify run](https://github.com/rajkaria/countersign/actions/runs/38306173639) succeeds at 0117361. Both run a clean installation, the full Node 22 gate and 44 desktop/mobile browser cases. The presentation revision's actual [container build/smoke](https://github.com/rajkaria/countersign/actions/runs/38306173630/job/115000650767) succeeds; its separate strict provider audit fails on the disclosed dependency findings. All 44 browser cases also pass against the deployed public alias. Health now derives its release version from package.json; release readbacks check that it matches the shipped package instead of retaining a hardcoded previous version. Exact final metadata-fix deployment/CI readbacks are retained in the private handoff.

The released public landing/docs/demo and private console/API software use the existing alias. Health reports software version and structural workspace configuration; without owner setup, workspaceConfigured=false and executionEnabled=false and readiness deliberately returns 503. No database, wallet, funding, contract or financial worker activation was performed during this release. The exact release deployment and hosted readbacks are retained in the private workspace handoff.

GitHub Actions' historical runner-start billing restriction was superseded by the successful October 6 Verify run. The October 13 `Verify` and `Worker containers` runs are inspected separately for this release. The financial provider runtime-audit job deliberately remains a failing gate while the unpatched high advisory persists; build/smoke success cannot waive it. No billing settings or financial activation switches were changed.

Historical 0.3.0 evidence: at implementation commit `e1f791f`, the actual [container build/smoke job](https://github.com/rajkaria/countersign/actions/runs/38301286690/job/114984567529) passed: both final images built, package/nonroot isolation assertions passed, offline CLI/startup checks passed and the operations image completed a disabled cycle against an internal disposable PostgreSQL fixture. No external network route, live credential or provider effect was used by the smoke tests. The same workflow's separate provider audit failed as described above, so the overall workflow remains failed.

The [hosted Verify run](https://github.com/rajkaria/countersign/actions/runs/38301286692) at the same implementation commit succeeded, including a clean dependency installation without local environment files, the full Node 22 application/contract/build gate and all 36 desktop/mobile browser cases. This establishes reproducible software checks, not production tenant/provider compatibility or financial activation.
