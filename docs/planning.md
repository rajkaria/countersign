# Plan payments against cash you actually have

An individually valid invoice may still be unsafe to pay now. Countersign's planner looks at confirmed cash, reserves and competing obligations before selecting payments. An expected customer deposit does not become spendable because it appears in a forecast.

## Planning inputs

| Input | Meaning |
|---|---|
| Confirmed cash | The balance from a recent finalized Safe observation |
| Operating reserve | Cash floor plus the configured fee reserve |
| Protected reserve | Cash set aside for protected obligations |
| Pending reserve | Existing payment commitments not already reflected in the balance |
| Payment items | Remaining eligible invoice amounts and their due dates |
| Expected inflows | Explanatory forecasts; never added to available cash |

Reserves must be disjoint. Counting a submitted payment both in a reduced observed balance and again as a pending debit would understate available cash. Ignoring it before the balance reflects the debit would overstate cash. The workspace uses source-confirmation time relative to observation time to avoid that double count.

## Build a plan

1. Register the correct Safe and a policy with cash floor, fee reserve, protected amount and limits.
2. Refresh the Safe from the configured RPC. Planning rejects an observation older than five minutes.
3. Review invoices and reconcile transfers so the eligibility decision reflects current evidence.
4. Build a plan for the selected policy and inspect the persisted observation and policy version references.
5. Resolve any cash shortfall or evidence hold, then recompute after confirmed changes.

The plan endpoint requires an owner, approver or operator. It records a plan; it does not sign or broadcast transactions.

## Example: two eligible invoices

Assume a synthetic Safe has 3,000 USDC confirmed. Operating and fee reserves total 500 USDC and protected cash is 1,500 USDC. That leaves 1,000 USDC for eligible payment items. An 800 USDC invoice fits; a competing 600 USDC invoice then has a 400 USDC shortfall. Both cannot spend the same initial 1,000 USDC.

The planner shows a scheduled item and the missing cash. A future 1,000 USDC receivable does not eliminate the shortfall until it is confirmed. Scheduling is not settlement and does not mean a bank or chain instruction has been created.

## Timing and priority

The domain planner sorts by customer priority, due date and stable ID. It supports explicit early-payment and route lead-time inputs. The current manual workspace plan assigns equal priority, uses due dates, sets fees to zero and does not permit early payment. Do not assume a configurable priority editor or a fee-bearing route exists because the underlying library has those concepts.

A feasible future item consumes planning capacity once, preserving room for its obligation. The standing automation groups policies that use the same Safe so independent policy runs cannot each assume the same cash is available. See [automation](/docs/automation).

## When planning stops

Stale observations, unmatched external transfers, unresolved invoices, insufficient cash and inactive authority need action before release. A new finalized inflow can change the cash result. A new acceptance can change eligibility. Neither automatically widens delegated spending limits.

Planning uses the recorded obligation set; it cannot discover unrecorded payroll, taxes or supplier commitments. Owners must keep reserves and the obligation register complete enough for the business. A cash plan is operational assistance, not a guarantee of solvency.

Continue with [payments](/docs/payments) for execution, [accounting](/docs/accounting) for reconciliation, and [operations](/docs/operations) for monitoring.
