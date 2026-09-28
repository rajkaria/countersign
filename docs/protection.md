# Protection must be reserved before it is promised

Reserved payment protection is designed for precisely defined approval or execution errors. It is not a blanket refund promise and is not currently activated in this deployment.

## Funding and exposure

Every covered payment reserves its full advertised maximum liability before execution. The contract binds that allocation to the exact permit. Active allocations, uncertain executions and pending claims retain capacity. Withdrawals may use only unallocated surplus.

A 1,000 USDC reserve cannot fully cover three simultaneous 600 USDC payments. The system refuses over-allocation. Covered-only operation remains unexecuted when capacity is unavailable. A human may review the next step; continuing uncovered requires explicit owner permission and the appropriate authority change.

## Claims

The designed filing window is 14 days from confirmed delivery. Cross-chain source burn does not start the clock. Filed claims retain their allocation through review and final resolution. Payouts cannot exceed the allocated cap or independently established net loss after other recovery. Duplicate payout is rejected.

A refund is a separate compensating transfer. It cannot undo a completed USDC payment. The implemented reserve uses the fixed business Safe recovery destination; the demo never fabricates a harmful payment to demonstrate reimbursement.

## Activation checklist

- Actual funded reserve and verified contract deployment.
- Accepted customer terms specifying per-payment, customer, aggregate and claim-period limits.
- Individually stated exclusions, including work-quality disputes and human overrides.
- An appointed independent reviewer who accepts the role and dispute/appeal procedure.
- Authorized payout and recovery destinations, documented incident owner and monitoring.

Price and initial reserve hypotheses are not funded balances, validated economics or purchase offers. Review the proposed legal terms before advertising live protection.

## The exact covered-payment sequence

1. The ordinary invoice verification and deployment gates pass, except for the required allocation.
2. Authorization creates the exact unsigned permit and returns the collateral-allocation requirements.
3. The independent reserve allocator reserves the advertised maximum liability against that permit digest and accepted terms.
4. A later authorization verifies the on-chain allocation before signing the same permit.
5. Execution and destination confirmation preserve the allocation through uncertainty, the filing window and any pending claim.

A database flag is not collateral. An expired or changed unsigned permit must be reconciled with its original operation and reserve allocation; silently replacing it could leave liabilities untracked.

## Example: capacity is unavailable

Suppose an illustrative reserve has 1,000 USDC and a live 600 USDC allocation. Only 400 USDC remains unallocated, so another payment requiring 600 USDC of protection cannot be advertised as fully covered. Add approved collateral, wait until the first liability can lawfully release, or keep the new payment unexecuted under its current terms. A new uncovered payment requires a separately explicit owner decision; there is no automatic coverage downgrade.

## What a claim must establish

A reviewer needs the exact payment and permit, accepted protection terms, the alleged covered approval or execution error, evidence of net loss and any other recovery. Work-quality disputes and excluded human actions are not silently converted into a covered incident. The reviewer applies the accepted terms and bound cap, and records the result.

The reserve contracts prevent duplicate payouts within their identity boundaries. Operational review must also investigate related payments, other reserves and outside recoveries; a contract cannot discover every duplicate loss claim in the world.

## Recovery and reserve integrity

The implementation uses a fixed business Safe recovery destination for compensation. A payout is separate from the original vendor settlement. Pending claims retain collateral even when the reviewer or application is unavailable. Administrators can withdraw free collateral only; there is no emergency path that dilutes active liabilities.

Treat any protected-reserve demonstration as synthetic until the [release status](/docs/release-status) identifies an actual funded deployment, accepted terms and independent reviewer. See [contracts](/docs/contracts) for the mechanics and [recovery](/docs/recovery) for unresolved operations.
