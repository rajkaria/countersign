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
