# Deterministic decisions and financial invariants

The domain library is pure TypeScript. It performs no network calls, credential access, signatures, or transfers. All inputs must be assembled from authenticated, organization-scoped, versioned records. Model and vendor submissions are proposals; their `approvedBy`, destination, policy, acceptance, or allocation fields must never be trusted as database authority.

## Decision verification

`verifyObligation(input)` returns a versioned `Decision` with `PAY`, `SCHEDULE`, `HOLD`, `ASK`, or `PROPOSE_PARTIAL`, explicit findings, source IDs, expiry, and `executable`. A `PAY` recommendation in Observe or Prepare mode is **not** execution authority. Only a Delegate decision with `executable: true` can proceed to the separate execution gates.

Checks include tenant/vendor/engagement identity and versions; approved effective terms; billing period; currency; exact amount; hourly quantities; trusted destination and destination version; current policy limits and pause state; paid and pending allocation ceilings; fresh reconciled history; external-transfer ambiguity; authorized, unrevoked, unexpired customer acceptance; and reserved protection where required. Merged code and other activity do not satisfy required acceptance. Missing approvals produce an actionable request. Malformed amounts or dates fail closed.

Money is a canonical nonnegative decimal string of atomic units. `atomic()` validates uint256 bounds; calculations use `bigint`. `units()` rejects excess precision rather than rounding. Hourly quantity is currently a whole-number approved unit; represent smaller units through an explicitly approved rate per minute/unit rather than fractional floating-point hours. Different invoice and settlement currencies require a separately approved conversion path and currently fail closed in this verifier.

Partial payment requires explicit engagement permission and any minimum amount. Both invoice and obligation allocations include reserved, submitted, and settled amounts. Released allocations free capacity only after the execution layer proves nonexecution. A credit is a separately authorized accounting event, never a negative payment allocation.

### Obligation identity

The repository must assign an obligation from approved engagement terms and its period or milestone. It must not accept arbitrary new obligation IDs from vendors or models. Changing invoice IDs cannot clear an existing obligation balance. Period overlaps and milestone correspondence require trusted matching before verification. Unique database constraints and serialized reservations enforce this across simultaneous requests. The pure verifier alone cannot serialize concurrent callers or detect missing database history.

### Freshness and revalidation

Decision validity is bounded by five minutes, policy expiry, payment-history freshness, and acceptance validity. Re-read versions, balances, allocations, and route state immediately before signing or submission. A material policy, destination, engagement, or acceptance change invalidates previously prepared authorization. Independent on-chain permit constraints remain necessary.

## Commitment planning

`planCommitments()` uses confirmed cash only. Expected inflows are returned for explanation and never add spendable balance. Operating, protected, and pending reserves must be disjoint and must not also appear as payment items. Eligible items are sorted by customer priority, due date, and stable ID. Each feasible current or scheduled item consumes planning capacity once; an early-payment policy and route lead time control timing. A liquidity shortfall returns a scheduled item with an explicit shortfall, not a savings claim or completed payment. Recompute after confirmed new funds.

## Execution lifecycle

`transitionExecution()` is a reducer for one immutable payment identity. Persist its initial record and idempotent outbox before network submission. Capacity reservation and authorization precede submission. A timeout produces `uncertain`; blindly submitting from that state is rejected. Reconcile using the original provider request ID and transaction. Only positive terminal nonexecution evidence permits a retry, preserving payment and provider identities.

Cross-chain source confirmation yields `destination_pending`. Settlement requires a finalized destination observation matching payment chain, recipient, asset, and full amount. Source confirmation alone does not mark a cross-chain invoice paid. Provider/chain observations passed to the reducer must be independently authenticated; a boolean supplied by an API caller is not chain evidence. Same-chain confirmation must be checked against the expected module event by the integration layer before reduction.

## Append-only operational ledger

`makeLedgerEvent()` validates exact balance **per asset**. Events model recognition, reservation, transit, settlement, fees, credit, refund, and correction. A reservation uses commitment accounts; it does not pretend cash moved. Fees must have their own balanced postings. `reverseLedgerEvent()` generates a new event linked to the original; history is never overwritten.

`exportLedger()` returns deterministic CSV and versioned JSON. Duplicate identical event identities collapse; conflicting identities and mixed tenants are rejected. CSV guards spreadsheet formula injection. Columns preserve payment/invoice/engagement/vendor identity, original denomination, atomic settlement units, network and transaction, category, approval, status, reversal, and FX quote. Posting accounts and accounting import mapping require customer/bookkeeper confirmation before claiming compatibility with their books.

## Reserved payment protection

Coverage reducers operate on a complete pool snapshot that the repository must serialize. `coverageCapacity` equals funded reserves minus active allocations minus other disjoint liabilities. Allocation binds exact payment, invoice, tenant, permit hash, cap, recovery destination, and terms version. Two concurrent requests cannot safely use separate stale snapshots: use a database lock and an on-chain reserved allocation before covered execution.

The filing window is 14 days after confirmed settlement. Pending or approved claims retain full capacity after expiry. Claims require evidenced net loss after prior recovery, are bounded by the allocation, and cannot pay twice. Payout requires the approved amount and previously authenticated recovery destination. A claim payment is a compensating transfer. Withdrawal cannot impair outstanding liability. Unsettled allocations cannot be released without proof the associated permit can no longer execute.

These functions do not establish funded collateral, valid terms, an independent reviewer, or live protection. Those operational gates must be verified separately. Rejected claims retain allocation until window expiry; appeals must remain within a separately approved adjudication process and must not silently expand coverage.

## Portable receipt schema and CLI

`receiptSchema` is the executable strict Zod v1 schema; `createReceipt` creates a SHA-256 commitment over canonical restricted JSON. Object keys sort lexicographically; amounts are strings; metadata numbers must be safe integers. Arrays preserve order. Undefined values, nonfinite numbers, dates as objects, and non-JSON values are rejected. The receipt binds the decision versions/amount, payment identity, recipient, source/destination chain, asset, expiry, evidence commitments, and optional destination settlement.

```sh
npm run receipt:verify -- receipt.json
npm run receipt:verify -- receipt.json 0xTRUSTED_SHA256_COMMITMENT
```

Exit 0 means schema, hash, and field bindings pass; exit 1 means verification failed; exit 2 means missing CLI arguments. Without an externally trusted commitment the result reports `anchored: false`: an attacker controlling a receipt can edit and rehash it. `verifyReceiptSignature` separately verifies an EIP-191 signature over `Countersign receipt v1:<hash>` against an independently trusted signer address.

A receipt is **not** proof of work quality, factual truth, complete logging, or chain finality. The offline verifier performs no chain calls. Keep raw documents and customer identities private; redact before receipt creation, and use randomized commitments for private low-entropy content. A public hash alone can expose guessable data. Do not call the receipt independently anchored unless the caller actually possesses an external commitment or trusted signature.

## Evaluation and fixtures

`evaluateCohorts()` reports each experimental arm separately within independent mainnet, independent testnet, founder mainnet, founder testnet, historical replay, and synthetic cohorts. Metrics include sample size, unique businesses/recipients, median active review minutes, false holds, missed confirmed problems, disputed labels, on-time observations, repeat businesses, costs, and verified incremental avoided overpayment. Held invoice principal is never automatically called savings. Settled volume requires stable payment IDs and counts each destination payment once per cohort/arm. Results are descriptive, not a safety guarantee or proof of causal improvement.

`createDemoFixture()` contains synthetic dates, addresses, records, and scenarios. It is suitable for isolated explanation and adversarial verification, never evidence of customer adoption or a deployment. Fixtures require no credentials and cannot move money.

Run focused tests with `npm test -- --run tests/domain`. The full project verification additionally checks persistence, contract enforcement, integrations, typechecking, and production build.

### Reproducible three-arm evaluation CLI

`npx tsx scripts/evaluate.ts experiment.json [report.json] [trusted-manifest-commitment]` validates an `evaluationBundleSchema` bundle, verifies its frozen manifest hash, and refuses incomplete comparisons. Every held-out case must include exactly one prior-workflow, rules, and rules-agent result against the same point-in-time input commitment. A case cannot use later evidence or silently disappear from one arm. The manifest carries adjudicator identity, cohort, as-of time, label, and the confirmed incorrect incremental amount. Each result supplies measured active human minutes and a timing evidence ID; missing measurements are not replaced with invented zeroes. Output files are created exclusively and never overwrite existing results.

Externally frozen commitments can be supplied as the third argument. Otherwise the report marks `externallyAnchored: false`; local metadata alone does not establish that the dataset was frozen before development. Empty datasets produce no claimed metrics. No customer results are shipped because none have been collected through this implementation.
