# Release status

Updated 16 October 2026 for software version 0.8.0. This page distinguishes software capability from externally verified production operation.

## Finding your way

The [handbook home](/docs) organizes all 34 public guides by task and topic. Start with the [guided walkthrough](/review), [your first review](/docs/getting-started) or [the API](/docs/api). A new [payment lifecycle guide](/docs/payment-lifecycle) connects the steps; [Resolve a finding](/docs/troubleshooting) gives responsible people and next actions. Interactive handbook diagrams are explicitly illustrative and create no model, wallet or payment request. Raw Markdown, search and the full LLM corpus use the same allowlisted guide sources.

## Current hosting

The demo is live at [usecountersign.xyz](https://usecountersign.xyz), which redirects to the canonical [www.usecountersign.xyz](https://www.usecountersign.xyz). The source is private at [rajkaria/countersign](https://github.com/rajkaria/countersign). A dedicated Neon PostgreSQL database is provisioned through Vercel, all five migrations are applied, and production readiness returns 200 with the schema verified. Authenticated synthetic records, role boundaries, tenant isolation and four encrypted document roundtrips have been exercised against this deployment. A logical backup was restored into a separate database; fingerprints and authenticated plaintext recovery match. These checks use generated records, not customer data, an independent audit or provider PITR evidence. Financial execution remains disabled.

One operations-only worker is hosted separately on Railway with fixed CPU/memory limits and a demo expiry of 18 October 2026, 20:00 UTC. It carries no Circle profile or verifier key; notices and financial execution are disabled. This host does not establish unattended payment execution. Continued hosting after the demo window needs an explicit operating decision.

The home-page demo button opens the wallet-free [guided walkthrough](/review). It includes five reproducible browser cases and a separate recorded-evidence section summarizing the completed synthetic DeepSeek request, manual Arc transfer and persistence/restore checks. Inspect or download the authored summary without contacting a model, wallet or payment provider. The interactive fixtures and recorded checks remain distinct.

## Implemented software

- A responsive landing page, searchable synthetic workspace, read-only onboarding UI and detailed handbook.
- Injected-wallet and external EOA challenge/signature authentication, tenant-scoped records, versioned terms, private encrypted document intake, customer acceptance and case-scoped vendor corrections.
- Deterministic obligation checks, commitment planning, operational state machines, receipt verification and cohort-separated evaluation.
- Constrained Safe module, restricted CCTP adapter and reserved protection contracts with local tests.
- PostgreSQL schema, migrations, durable outbox worker and documented integration adapters.
- Exact hourly quantities, partial installment preparation, versioned corrections and acceptance revocation.
- A functional tenant console with cash planning, payment details, reconciliation, scoped access administration and one-time capability display.
- An operations desk with currency-separated payable totals, exception owners/deadlines, quiet-hour preferences, reminder previews and accounting period packs that disclose unresolved settlement.
- Redacted activation diagnostics, optional read-only provider/deployment probes, isolated restore fingerprints and a separate operations-only reminder worker.
- Owner-visible console setup, database-only schema readbacks and readiness that checks all shipped migrations and security columns.
- A priority review queue with scoped invoice/case/payment links, readable exact reminders and retained recovery targets beyond the bounded activity list.
- A private local pilot capture kit for consent, frozen point-in-time inputs, measured three-arm comparisons and cohort-separated exports. Empty templates are not customer evidence.
- Separate locked production worker runtimes, nonroot images and independent container build/smoke and provider-audit checks.

- A reproducible [reviewer walkthrough](/review) with exact production-verifier inputs/outputs, activity-versus-acceptance, corrections, partial allocations, renamed duplicates and retained timeout identities. Downloads remain explicitly synthetic.
- Inspectable model proposals with missing questions, citations, preserved model evidence snapshot and invoice/terms/policy bindings. Model context comes from the original verification transaction; saving revalidates current membership.
- Production-planner parity in the isolated demo, exact currencies and dates, source-required custom invoices and clearly authored proposal fixtures. An authored model fixture is never presented as an executed model response.
- Persistent-worker review expiry rechecked before new submissions, with reconciliation retained across restart; conservative Arc native-USDC observation and unique matching of outgoing effects to operations.

- A private actual-model comparison runner over frozen consented originals, independent of database/wallet setup, with explicit external-processing and paid-call opt-ins, durable one-call reservation and incomplete measurement drafts. Its fixtures alone do not establish actual model or customer outcomes.
- An interactive source-cited clarification comparison that re-verifies human answers while preserving amount, terms, recipient and Observe-mode authority. Sample questions are authored fixtures, not executed model output.
- Explicit OpenAI and DeepSeek provider selection with fixed endpoints, validated structured proposals and provider/model-bound pilot processing consent. DeepSeek Flash supports text, CSV, PNG and JPEG; PDF input is rejected before disclosure. One approved actual DeepSeek Flash request over a frozen fictional missing-acceptance case returned ASK with two source-bound questions. It used 3,971 input / 368 output tokens and 2,685 ms provider latency. The peak-price token estimate is below USD0.002; billing and human review benefit are not established. This is synthetic compatibility evidence, not a measured business comparison.
- A private, explicitly hypothetical business pack with five synthetic cases, complete text originals and reproducible offline context/rules outputs. These examples are not a real business, independent adjudication, measured utility or traction.
- A separate owner-authorized local-wallet smoke test delivered 1 testnet USDC on Arc with a matched transfer event, exact recipient balance and finalized-block readback. It is a manual local-EOA test funded by the Circle faucet, not Circle Agent Wallet execution, a Countersign invoice payment or commercial settlement.

## Not established by this release

- Circle wallet provisioning and end-to-end compatibility with the deployed Safe module.
- Deployed and independently reviewed contracts, real business payment settlement or tested mainnet delegation.
- Funded payment protection, agreed legal terms or an appointed independent claims reviewer.
- Independent customers, measured time savings, revenue, or repeat business payment cycles.
- A publicly hosted approved event video. A narrated/captioned software recording below three minutes exists privately; it is synthetic and is not live Circle, customer or model-quality evidence.
- A public-source event submission, accepted optional OSS commitment, or submitted form.
- A clean financial provider dependency audit: unpatched Circle CLI dependency findings remain a separate financial activation gate. See [security review](/docs/security-review).

The source repository is private at the owner's request. Demo records are synthetic and isolated; they are never included in real-workspace metrics. Live execution remains disabled until the complete deployment and authority gates have passed. See the repository release report for check results and exact configuration status.
