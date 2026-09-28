# Understand every payment decision

Countersign's deterministic verifier compares the current approved records and returns a decision with findings, source identifiers, record versions, evaluation time and expiry. The same inputs produce the same domain result. An optional model can explain the result, but it cannot remove a blocking condition.

## Read the action and the authority separately

| Action | Meaning | Next step |
|---|---|---|
| PAY | The supplied release checks pass | Check the mode, expiry and remaining execution gates |
| ASK | Required evidence or approval is missing | Obtain it from the authorized person, then review again |
| HOLD | A conflict or unsafe condition blocks release | Resolve the recorded finding; do not bypass it |
| PROPOSE_PARTIAL | The proposed partial amount requires approved terms | Review exact partial-payment permission and limits |
| SCHEDULE | A planning or proposal outcome defers the payment | Review the due date, available cash and shortfall |

The core obligation verifier returns PAY, ASK, HOLD or PROPOSE_PARTIAL; SCHEDULE is available to the planning/proposal layer. A PAY decision in Observe or Prepare is analysis, not spending authority. Delegate still requires a current exact permit, reviewed deployment, on-chain limits and operational readiness.

## What the verifier checks

- Organization, vendor, invoice, agreement and policy identity and versions.
- Approved active terms and a billing period within their effective dates.
- Currency, positive amount, contractual amount and any required approved quantities.
- The independently verified destination address, chain and destination version.
- Per-payment, rolling and remaining delegation limits, policy expiry and pause state.
- Prior settled, pending and reserved amounts for the invoice, obligation and agreement ceiling.
- Current reconciled payment history and unresolved external transfers.
- Required customer acceptance by an allowed actor for the exact obligation and terms.
- Required reserved protection before covered delegated execution.

Server-side review also detects overlapping periods, ambiguous policy selection, an unverified token configuration and an unverified Delegate deployment. The pure library cannot discover records that the caller omitted; tenant-scoped reads and database locks are part of the overall control.

## Common findings and how to resolve them

| Finding | Interpretation | Resolution |
|---|---|---|
| TERMS_UNAPPROVED | Agreement is not active under an authorized owner | Review and activate the exact terms |
| ENGAGEMENT_MISMATCH | Invoice and current agreement version differ | Review the amendment and the invoice binding |
| DESTINATION_CHANGED | Address, chain or destination version differs | Complete the controlled destination review |
| ACCEPTANCE_REQUIRED | Current authorized acceptance is absent | Ask the named customer acceptor to attest |
| OBLIGATION_CAP | The obligation is already paid or committed | Inspect existing payments and allocations |
| OVERLAPPING_OBLIGATION | Another period overlaps this obligation | Resolve the period identity before new allocation |
| HISTORY_STALE | The observation is too old | Refresh and reconcile the Safe history |
| EXTERNAL_PAYMENT_UNMATCHED | A transfer has not been explained | Classify it against supporting evidence |
| POLICY_CAP | The available limit is insufficient | Have owners review policy through the proper authority path |
| COVERAGE_REQUIRED | Full required liability has not been reserved | Complete the exact funded allocation or remain unexecuted |
| HOURS_MISSING | Approved rate and quantity are absent | Provide an implementation-supported reviewed quantity path |

The current workspace does not populate the domain verifier's full hourly rate/quantity inputs, so hourly records remain evidence requests rather than a demonstrated end-to-end hourly payment flow. Choosing an hourly billing label does not bypass this check.

## Decisions expire

Domain validity is at most five minutes and can be shorter because of policy expiry, history freshness or acceptance validity. The workspace currently uses five-minute history freshness and a maximum acceptance age of 24 hours; an earlier explicit acceptance expiry shortens that window.

Re-read records, allocations, balances and route state immediately before authorization. A material amendment invalidates old prepared authority. A previously green result is historical evidence, not permission to execute after the records change.

## Worked example: missing acceptance

An illustrative 800 USDC retainer has an approved amount, matching period and trusted destination. Delivery acceptance is required. A linked merged pull request establishes activity, so the decision asks for customer acceptance. The allowed customer acceptor attests to the exact obligation and version. A new review can resolve that finding, but it must still evaluate history, policy and available allocations. The first finding disappearing does not guarantee PAY.

## Owner holds

An owner can hold a versioned invoice with an explanation of at least ten characters. Clearing needs fresh sign-in within five minutes and a new review. Neither action changes the vendor destination, expands policy, adds coverage or reverses a submitted transfer. See [recovery](/docs/recovery).

For implementers, [domain invariants](/docs/domain) describe exact types and [API reference](/docs/api) describes authenticated review requests.
