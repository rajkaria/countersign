# Measure utility without manufacturing traction

Product usefulness is measured in correct on-time payments and reduced administrative work. A synthetic demo, a funded wallet, or a bridge hop is not a customer.

## Three comparisons

Use the same point-in-time case set for the customer's prior workflow, a strong deterministic rules baseline, and that baseline plus the agent. Freeze labels and allowable actions before evaluation. Hold out vendors or engagements when practical. Never show later amendments to a model evaluating an earlier decision.

## Report the denominators

Record review minutes per invoice, valid-invoice false holds, missed confirmed issues, due-date completion, accepted escalations, repeat payment cycles, latency and cost. Show the sample size and disagreements. A held invoice is not money saved: avoided overpayment is only the independently confirmed incorrect increment.

## Keep cohorts separate

Synthetic scenarios, internal tests, historical replay, genuine business testnet use, founder-owned mainnet businesses, and independent external mainnet businesses are separate cohorts. Count a cross-chain vendor payment once, on destination delivery. Do not count prefunding, bridge hops or refunded demonstration payments as additional vendor volume.

## Customer evidence capsules

A public capsule requires consent, redaction review, the actual obligation, before/after operator confirmation, timing evidence and a real transaction if settlement is claimed. No customer capsule is published by default. Empty evidence states are preferable to invented logos, testimonials or metrics.

The current [facts register](/docs/release-status) reports what has been verified. Goals are not outcomes, and an internal model review is not an independent security audit.

## Build a reproducible experiment

Freeze a manifest containing a stable case ID, business/vendor identifiers, cohort, point-in-time input commitment, adjudicated label and independently confirmed incorrect increment when applicable. Each held-out case must have results for all three arms: prior workflow, rules, and rules plus agent. Record the same input commitment for every arm.

Results include action, measured human minutes, operating cost, settlement units, due-date result, repeat-cycle indicator and timing-evidence ID. The implementation rejects duplicate case/arm results, inconsistent input commitments and an incomplete three-arm comparison. It does not invent missing timings or externally validate the truth of a supplied measurement.

Run the evaluation CLI from the application checkout:

```sh
npm run evaluate -- experiment.json report.json
```

The optional third argument is an independently trusted manifest commitment. The report output path must not already exist. Keep customer input bundles private and publish only consented, redacted evidence.

## Interpret the report

| Measure | Meaning and limit |
|---|---|
| Median human minutes | Typical recorded review time in the cohort and arm |
| False-hold rate | HOLD or ASK among adjudicated valid cases; undefined without valid cases |
| Missed-problem rate | PAY among confirmed-problem cases; undefined without confirmed problems |
| Confirmed avoided amount | Only the proven incorrect incremental amount actually prevented |
| Settled volume | Stable payment identities counted once, with consistent values |
| Repeat businesses | Distinct businesses with an observed repeat cycle |
| Operating cost | Recorded cost units, not a guessed claim about production economics |

Disputed labels remain visible. Empty denominators are reported without invented zero-rate certainty. Commitments show consistency relative to a trusted frozen manifest; they cannot prove data truth or rule out training leakage. Small samples remain descriptive and do not establish causal benefit or a safety guarantee.

## A practical decision rule

Before a pilot, agree what improvement would justify continued use and what mistakes require stopping or returning to human preparation. Review false holds as well as missed issues: a system that blocks every invoice is not useful payment operations. Use actual operator feedback and repeat business cycles alongside numerical outcomes.

For context, read [why Countersign](/docs/why-countersign) and [start read-only](/docs/start-read-only).

## Start a local pilot today

The portable pilot kit captures a reproducible comparison without waiting for a database, notification service or wallet. Capture, blind-context export and rules review are offline. The optional model runner makes one bounded provider call only with separate processing consent, a private key and explicit paid-call opt-in. No command sends a notice or payment. A consented review pilot can therefore start before financial activation.

Run these commands from the application checkout. Keep originals and the capture directory outside every Git checkout, including any surrounding private planning repository, and outside public or shared folders:

```sh
npm run pilot -- init "$HOME/countersign-pilot"
```

The new directory contains `pilot.json`, `case-template.json`, `measurement-template.json`, `arm-input-template.json`, `run-config-template.json`, and a walkthrough. The study is a valid empty draft with no cases or consents; arm/run templates remain incomplete until actual input is supplied. Templates use `null` for missing information: they do not supply identities, sample timings, measured zeros, customer outcomes, or consent. Existing directories and output files are never overwritten. On Unix systems, new directories use mode `0700` and files use `0600`; access-control behavior on other systems still depends on the host. The CLI checks canonical destinations through existing symlinked parents and rejects the application checkout and existing Git ancestors. New model-run input files also must be outside Git. This is a write-time boundary, not protection against later copying or publishing files. JSON inputs and reusable capture outputs have a 20 MB limit.

## Prepare the held-out study

Fill the study ID and adjudicator ID. Use pseudonymous business, vendor, and case IDs; retain the private mapping separately. Declare both `settlementAsset` and `operatingCostAsset` as objects with `id`, `label`, and `decimals`. An optional `identity` contains exact `symbol`, `chainId`, token `address` and `decimals`; its precision must match the outer asset. Runnable crypto arms require this identity on the frozen settlement asset. It enters the frozen commitment and report; a mutable run config cannot redefine it. Legacy manual/fiat capture may omit it. One study uses one settlement asset and one cost asset. If cases involve another token, chain, currency or precision, create a separate study. USD costs and USDC settlement amounts are separate measurements; no conversion or price assumption is applied.

Complete one case template per obligation and place the objects in `pilot.json`'s `cases` array:

| Case field | What to record |
|---|---|
| `caseId`, `businessId`, `vendorId` | Stable pseudonymous identities |
| `cohort` | Exactly one of the six separate cohorts listed below |
| `label` | `valid`, `confirmed-problem`, or `disputed`, adjudicated before evaluation |
| `obligationUnits` | Exact obligation in canonical nonnegative integer strings |
| `incorrectIncrementalUnits` | The independently confirmed incorrect increment; `"0"` for valid or disputed labels |
| `dueAt` | The actual obligation's ISO timestamp, including timezone offset |
| `adjudicationEvidenceId` | Private reference to the label/reviewer evidence |
| `snapshot` | `{ "asOf": "<actual ISO timestamp>", "evidenceIds": ["<private evidence reference>"], "content": {} }`, filled with the complete permitted point-in-time input |

The snapshot's `content` is the actual information available to all three arms. Include only sources available at `asOf`; keep later acceptance, amendments, and settlement information outside it. Store money as integer or decimal strings. JSON numeric values in frozen inputs must be safe integers; the kit refuses floating-point numbers rather than silently rounding them. The incorrect increment cannot exceed the obligation. Case IDs and snapshot evidence IDs must be unique within their respective scope.

Allowed cohorts are `independent-mainnet`, `independent-testnet`, `founder-mainnet`, `founder-testnet`, `historical-replay`, and `synthetic`. A real founder business stays founder-controlled. A testnet exercise stays testnet. Historical payment history belongs to historical replay, and a generated scenario stays synthetic.

## Record and maintain consent

Every non-synthetic business, including a historical replay or founder business, needs an active local-analysis consent reference before freezing or recording. In `pilot.json`'s `consents` array, each business has a `businessId`, `localAnalysis`, and `publication`. Each non-null grant contains `evidenceId`, `grantedAt`, and `revokedAt` (`null` until withdrawal). Use the actual private consent record and timestamps; permission to analyse locally does not grant permission to publish.

Leave `publication` null unless there is a separate, applicable publication grant. The kit only checks that supplied grants are present, temporally active, and consistent with the frozen evidence reference. It cannot verify the signer's authority, the consent's scope, or a withdrawal recorded elsewhere. Confirm those facts with the owner.

After freezing, keep the session's editable `consents` registry current. Set `revokedAt` when permission is withdrawn. Subsequent checks, recording, and exports reject the withdrawn business information. Stop processing it and delete or segregate retained captures and prior reports as the actual agreement requires. A local revocation does not erase previously exported files. Fresh permission requires a new study; do not alter the original frozen data or its commitment.

## Freeze before observing results

```sh
npm run pilot -- freeze \
  "$HOME/countersign-pilot/pilot.json" \
  "$HOME/countersign-pilot/session-00.json"
```

The CLI fixes the current freeze time, salts each private snapshot, computes its `inputCommitment`, and prints a commitment to the full frozen study. Save that commitment with an independent reviewer before collecting results. The salts and raw snapshots remain private in the session; reports exclude them. A salt reduces guessing attacks on low-entropy source hashes but does not make private content safe to publish.

Use the same frozen session for the entire comparison. Copy each case's `inputCommitment` into all three measurement records. Re-freezing produces a different study commitment and cannot be used as a shortcut for changing a case mid-experiment. The CLI rejects future input snapshots, tampered commitments, unknown cases, duplicate arms, and changed inputs. An independently trusted commitment anchors consistency; it does not prove source truth, correct labels, or held-out status.

## Measure each workflow

Copy `measurement-template.json` to a new private measurement file and complete it for one arm. Allowed arms are `prior-workflow`, `rules`, and `rules-agent`. Start and stop the actual operator's timer; record only information that can be supported by evidence.

| Measurement | Required record |
|---|---|
| Review work | `operatorId`, `reviewStartedAt`, `reviewEndedAt`, measured `pausedMilliseconds`, `timingEvidenceId`, and `decisionEvidenceId` |
| Decision | One of `PAY`, `SCHEDULE`, `HOLD`, `ASK`, or `PROPOSE_PARTIAL` |
| Operating cost | Exact `costUnits` in the study's cost asset, with `costEvidenceId`; even a zero cost needs a supporting note |
| Application | `appliedToWorkflow`: whether this arm was actually used for this obligation |
| Due result | `on-time`, `late`, `unpaid`, `not-due`, `unknown`, or `not-observed` |
| Settlement | `null`, or `{ paymentId, units, deliveredAt, evidenceId }` for independently referenced destination delivery |
| Repeat/prevention | `repeatCycleEvidenceId` and `preventedEvidenceId`, null unless actually supported |
| Observation time | `observedAt`, after review completion and no later than the CLI's current time |

Human minutes are calculated from start/end timestamps minus the recorded pause. Pauses cannot exceed elapsed time; reviews must occur after the study freeze. If no pause occurred, explicitly enter `0` rather than accepting a fabricated default. The kit records human work; it does not count unattended model latency as human time.

Only one arm per obligation can be applied and claim workflow outcomes. Comparison-only arms use `appliedToWorkflow=false`, `dueOutcome="not-observed"`, and null settlement, repeat, and prevention references. They still contribute measured review time, decisions, and cost. This prevents replaying three reviews from becoming three payments or three customers. The kit does not execute any of those decisions.

`on-time` and `late` require at least the full obligation amount to reach its destination with a delivery timestamp consistent with the due date. The tool can record a mistaken overpayment; it shows delivery above the frozen obligation separately as excess rather than rejecting the observed error. Excess alone is not proof of fraud, loss, or the independently adjudicated incorrect increment. Partial delivery remains incomplete: after the due date, use `unpaid` with the partial settlement evidence. A pending obligation before its due date can be `not-due`; an uncertain applied outcome is `unknown`. Neither an uncertain source operation nor a transaction hash alone proves destination delivery. A stable payment ID cannot be reused across different obligations, amounts, or cohorts.

For historical replay, existing historical delivery evidence can belong only to the observed `prior-workflow` arm, and it cannot predate the case's point-in-time snapshot. The newly evaluated rules arms do not acquire that historical settlement. Historical evidence stays outside present customer traction.

Prevention needs a confirmed nonzero incorrect increment, an applied non-PAY action, and independent prevention evidence. Holding the whole invoice is not the avoided amount. Repeat-use evidence must refer to an actually observed additional business cycle.

## Capture, check, and export

Each capture produces a new session revision and preserves earlier files:

```sh
npm run pilot -- record \
  "$HOME/countersign-pilot/session-00.json" \
  "$HOME/countersign-pilot/measurement-prior.json" \
  "$HOME/countersign-pilot/session-01.json"

npm run pilot -- check "$HOME/countersign-pilot/session-01.json"
```

Repeat recording for the remaining arms and cases, using a new output filename each time. `check` lists the missing case/arm pairs. Export requires all three arms for every frozen case and currently active consent:

```sh
npm run pilot -- export \
  "$HOME/countersign-pilot/session-final.json" \
  "$HOME/countersign-pilot/private-report"
```

Add the independently trusted frozen study commitment as the final argument to `check` or `export` when available. A commitment copied only from the same untrusted session does not establish independent anchoring.

The export directory contains:

- `experiment.json`, compatible with the existing `npm run evaluate -- experiment.json` evaluator.
- `report.json`, including the explicit assets, exact amounts, measured records, evidence references, descriptive metrics, and limitations.
- `report.md`, a readable comparison with the label and due-outcome denominators.
- `measurements.csv`, an operator-review table with evidence references.

JSON is the authoritative exact-value record. CSV prefixes exact amounts and identities with an apostrophe to prevent spreadsheet precision loss and formula interpretation. Preserve that text when importing; do not turn large atomic-unit strings into floating-point numbers. Raw snapshot content, salts, and the private identity mapping are absent from the reports. Pseudonyms, labels, and evidence references may still be sensitive.

The report excludes `not-due`, `unknown`, and `not-observed` from on-time completion denominators, rather than turning missing outcomes into failures or successes. Each cohort's settlement evidence is reported separately; no combined traction total is created. Small samples, real operator feedback, repeat use, false holds, and missed issues should inform the next decision together.

All exports are private by default. A `publicationConsentComplete` flag only describes the supplied active grants for non-synthetic businesses; it is not publication approval, redaction proof, or external validation. No capture, customer capsule, or report is automatically published.

## Local rules-versus-model run

The first owner batch is a genuine record pack with local-analysis consent and independent labels held separately. For the model arm only, add a selected model, private API key, case-bound external-processing consent and approval for one paid call. Database, wallet, contracts and worker hosting are unnecessary for this review comparison. Source authenticity, actor authority and consent scope still require human evidence.

Before freezing, place a strict arm envelope into each selected case's `snapshot.content`:

| Field | Actual contents |
|---|---|
| `verification` | Complete normalized `VerificationInput`: tenant, current agreement/invoice/policy, acceptance, allocations/history, exact asset and point-in-time `now` |
| `originals` | Authorized text/excerpts with `sourceId`, `sourceHash`, `textSha256`, `kind`, `location` and exact `content` |

The business/tenant, vendor, due date and cutoff must match the normalized records; every nested tenant must belong to that business. Unapproved drafts may retain empty approval actors/dates and receive the real verifier's HOLD. No approval is invented.

Each original must cite an existing decision source and frozen evidence ID. `sourceHash` matches that source's original-document hash; `textSha256` hashes the exact UTF-8 text sent and is distinct from a binary PDF/image hash. `kind` is `original-text` or `excerpt`. Label excerpts and preserve their location. Changed hashes, ambiguous duplicates, unavailable sources and future evidence are rejected; context is never silently truncated.

Keep truth labels, acceptable-action adjudication, outcomes and cost evidence separate. The model receives normalized source context, bound original text and the strong deterministic decision/clarification baseline. It receives no case label, incorrect increment, adjudicator ID, consent record, observed outcome or cost. Strict objects reject extra label fields; a human must still prevent later information or adjudication from appearing in source prose.

Complete a copy of `run-config-template.json`:

| Run field | Binding |
|---|---|
| `runId` | Stable identity for this deliberately approved attempt; never rename an unknown attempt to conceal a retry |
| `trustedFrozenCommitment` | Independently retained frozen study commitment |
| `codeCommit` | Declared full Git SHA, or null; actual runtime source is captured separately |
| `rulesVersion` | Rule-version declaration, not independent version verification |
| `assetBinding` | Frozen `studyAssetId` and exact `symbol`, `chainId`, `address`, `decimals`, `termsCurrency` and `invoiceCurrency` |
| `provider` | `openai` (legacy default) or explicitly selected `deepseek` |
| `model` | Owner-selected provider model ID; null is allowed offline; use `deepseek-flash` for DeepSeek Flash |
| `externalModelConsent` | Null offline; otherwise the separate case/business/provider/model-bound processing grant |

The frozen asset identity, normalized input and run mapping must agree. The settlement label is the symbol or `Test ` followed by it. This single-asset runner rejects USD obligations against USDC and distinct same-symbol tokens; it performs no conversion or token-authenticity check. Full obligation units bind to fixed terms or exact hourly rate times quantity, rather than a smaller partial invoice/request. Incomplete hourly context retains the declared amount basis and missing-information result, not a validated hourly entitlement.

External consent contains `businessId`, `caseId`, `frozenCommitment`, `evidenceId`, `provider` (`"openai"` or `"deepseek"`), exact selected `model`, `grantedAt`, `expiresAt` and `revokedAt`. It must be current, unrevoked and bind to the exact case/study and selected provider/model. DeepSeek requires an explicit matching model in the grant. Legacy configs with no `provider` field default to OpenAI, and existing OpenAI grants without `model` remain compatible; an explicit grant model must always match. A grant for OpenAI cannot authorize sending records to DeepSeek. Local analysis and publication do not authorize provider disclosure. Keep grants current: local/external consent and frozen/source bindings are re-read immediately before dispatch and after response.

Give the prior-workflow reviewer only a blind context pack before showing other arms:

```sh
PILOT_DIR="$HOME/countersign-pilot"
npm run pilot -- context \
  "$PILOT_DIR/session-00.json" "YOUR-CASE-ID" \
  "$PILOT_DIR/run-config.json" "$PILOT_DIR/prior-context-01"
```

`context.json` contains normalized/original information and commitments, with no labels, rules answers or model output. Its prior-workflow measurement draft invents no decision, time or cost. Observe the operator's normal review, counterbalance order across new cases where practical, and disclose learning/remembered-case effects. The command cannot guarantee human blinding by itself.

Run the actual strong rules offline:

```sh
npm run pilot -- rules \
  "$PILOT_DIR/session-00.json" "YOUR-CASE-ID" \
  "$PILOT_DIR/run-config.json" "$PILOT_DIR/rules-01"
```

The baseline calls the unchanged product verifier. Its deterministic clarification questions name actual authorized acceptors, obligation, invoice reference, terms version and blocking condition. The model receives the same strong baseline; vague rules questions cannot manufacture an agent advantage.

For DeepSeek set `provider: "deepseek"` and `model: "deepseek-flash"` in the run config, and bind the consent grant to those same values. Only after privately configuring the matching `COUNTERSIGN_PILOT_DEEPSEEK_API_KEY` (or `COUNTERSIGN_PILOT_OPENAI_API_KEY` for OpenAI) and approving provider disclosure and one paid call:

```sh
npm run pilot -- run-arms \
  "$PILOT_DIR/session-00.json" "YOUR-CASE-ID" \
  "$PILOT_DIR/run-config.json" "$PILOT_DIR/model-01" \
  --allow-external-model --allow-paid-call
```

Keep the key out of JSON, command arguments, chat and git. The existing proposal-only adapter has no tools or model-controlled URLs, uses only the selected provider's fixed HTTPS Responses endpoint (OpenAI `store=false`; DeepSeek stateless Responses with thinking disabled), and accepts only deterministic actions and available citations. Each run permits one request, up to 50 evidence records, 20,000 characters per combined source record, 100,000 evidence characters, 120,000 serialized request characters, 1,000 output tokens, a 25-second adapter timeout and 1 MB provider JSON. These limits establish no dollar price; actual cost remains unknown until supplied.

A fixed private registry at `$HOME/.local/state/countersign/pilot-model-runs` is independent of session/output folders. Reservations retain the selected provider/model, and their frozen-study/case/run identity remains independent of provider so switching providers cannot reuse an uncertain attempt. Exclusive reservations are flushed to disk, with directory flushing where supported, before dispatch. Reusing the frozen-study/case/run identity is refused under a new output folder. There is no automatic retry/reset. Crashes, timeouts, invalid responses, changed sources and revoked consent leave reserved unknown/unusable attempts. Inspect original provider evidence before approving a genuinely new attempt. Carry the private registry when moving hosts; another host cannot infer prior reservations.

Artifacts retain the exact prepared snapshot, real rules result, private request/response evidence, commitments, policy/terms versions, actual Git HEAD/dirty state and critical source-file hashes. A declared SHA mismatch fails when actual HEAD exists; an archive records unavailable rather than verified. Dirty code stays visibly dirty. Hashes and version declarations establish consistency, not authentic sources, correct labels or a clean reproducible release.

`result.json` distinguishes `complete`, `rules-only` and `unknown`. Failed-response evidence retains HTTP status and bounded provider JSON with credential echoes redacted. Executable errors use fixed public text rather than private JSON, arbitrary keys, identifiers or paths.

`rulesQuestions`, agent `questions` and `answer-template.json` bind unanswered questions to run/case/input/evidence commitments, obligation and terms version. Actual answers require evidence, actor, statement, kind and timestamp. Prose, activity and a proposed question never become acceptance automatically. Evaluate legitimately updated records as a separate newly frozen case.

The rules and agent measurement drafts retain actual suggested actions/references but leave operator, human timing and monetary cost null. Complete them from observation/billing evidence, then use existing `record` and three-arm `export`. Unknown agent results have null action and cannot count as completed agent arms. Model latency is not human work; tokens are not monetary cost. No settlement, due success, prevention or repeat use is generated.

Assess agency through actionable correct missing conditions, citation fidelity, necessary lookups and measured operator effort versus strong rules. The same final action may accompany a useful question; different prose may add no value. Neither prose length nor the existence of a model call establishes usefulness.
