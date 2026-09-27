# Protection must be reserved before it is promised

Reserved payment protection is designed for precisely defined approval or execution errors. It is not a blanket refund promise and is not currently activated in this deployment.

## Funding and exposure

Every covered payment reserves its full advertised maximum liability before execution. The contract binds that allocation to the exact permit. Active allocations, uncertain executions and pending claims retain capacity. Withdrawals may use only unallocated surplus.

A 1,000 USDC reserve cannot fully cover three simultaneous 600 USDC payments. The system refuses over-allocation. Covered-only operation falls back to human preparation when capacity is unavailable. Continuing uncovered requires explicit owner permission.

## Claims

The designed filing window is 14 days from confirmed delivery. Cross-chain source burn does not start the clock. Filed claims retain their allocation through review and final resolution. Payouts cannot exceed the allocated cap or independently established net loss after other recovery. Duplicate payout is rejected.

A refund is a separate compensating transfer. It cannot undo a completed USDC payment. Beneficiary changes require authenticated controlled review; the demo never fabricates a harmful payment to demonstrate reimbursement.

## Activation checklist

- Actual funded reserve and verified contract deployment.
- Accepted customer terms specifying per-payment, customer, aggregate and claim-period limits.
- Individually stated exclusions, including work-quality disputes and human overrides.
- An appointed independent reviewer who accepts the role and dispute/appeal procedure.
- Authorized payout and recovery destinations, documented incident owner and monitoring.

Price and initial reserve hypotheses are not funded balances, validated economics or purchase offers. Review the proposed legal terms before advertising live protection.
