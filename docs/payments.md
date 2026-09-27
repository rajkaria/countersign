# A payment is a process, not a button

Countersign distinguishes preparation, authorization, submission, source confirmation, destination receipt, and accounting. A successful request to a wallet provider does not prove that a vendor received funds.

## Durable identity

Every payment intent is stored before network submission. Retries retain the same identity and provider idempotency key. A timeout after broadcast becomes uncertain; recovery queries the original operation. It does not create another payment just to escape a pending state.

Database uniqueness prevents a second active operation against the same invoice. Engagement-wide serialization and cumulative allocation checks are required at authorization; on-chain payment IDs and obligation caps provide another independent boundary.

## Commitment-aware scheduling

Spendable cash is confirmed balance after operating reserve, fees, pending commitments, and protected obligations. Expected revenue is not spendable. Payments are selected against a shared remaining balance, ordered by approved priority and due date.

For example, with 3,000 USDC confirmed, 1,500 protected, and 500 reserved for operations and fees, an 800 USDC payment fits. A second 600 USDC payment does not fit at the same time. The planner schedules it and reports the shortfall. Confirmed new revenue can change that decision.

## Cross-chain delivery

The restricted CCTP adapter binds the route, source debit, destination domain, recipient and maximum fee. Source burn means funds are in transit. A matching finalized destination observation is required to recognize delivery. Net received principal, not the gross source debit or bridge hops, is counted as vendor payment volume.

## Accounting

Monetary values use decimal strings in atomic units and bigint arithmetic. USDC ERC-20 units use six decimals only after the configured deployment is verified; Arc native gas reporting may use a different denomination. Reservations are commitments, not cash transfers.

The domain ledger validates balanced postings and uses reversal events for corrections. Stable external keys deduplicate imports. CSV escaping also neutralizes spreadsheet formula prefixes. Exports preserve payment identities, states and source/destination references. A bookkeeper must validate the mapping against the actual accounting workflow before production close.

## Review a receipt

A receipt explains the decision and binds the exact authorization and settlement references. It does not establish that the underlying work was good. See [portable verification](/docs/receipts).
