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

## Payment lifecycle reference

| Stage | What is established | What is not yet established |
|---|---|---|
| Prepared | A durable proposal tied to reviewed business records | Execution authority or funds movement |
| Authorized | The exact constrained authorization has passed its gates | Provider submission or settlement |
| Submitted | An attempt crossed the durable submission boundary | Final chain effect |
| Uncertain / recovery required | The result needs reconciliation under the original identity | Permission to create a replacement |
| Source confirmed | The exact approved source execution is finalized | Cross-chain recipient delivery |
| Destination pending | Cross-chain funds need matching destination confirmation | A paid invoice |
| Settled | The required exact delivery evidence and accounting update exist | Work quality or a blanket protection entitlement |

The names above describe lifecycle stages across the domain reducer, stored intents and integrations; use the actual returned state rather than assuming every adapter uses identical labels.

## Prepare a human proposal

An owner, approver or operator can prepare an eligible invoice in Prepare mode with a stable key of 8–160 characters. Observe mode refuses preparation. The server re-evaluates the invoice, derives the amount and bindings, then stores the payment intent before any external execution. A key already used for another invoice is a conflict; an invalidated operation must be reconciled before replacement.

The preparation endpoint does not broadcast. The authorization endpoint accepts an existing payment ID and derives money fields from trusted records. It cannot be used to supply a different recipient, route or amount to escape the review. See [API](/docs/api).

## What delegated execution additionally requires

The exact deployment must have a reviewed manifest, verified contracts, a compatible Circle agent-wallet path, an independent verifier and current on-chain policy. The module enforces the bound Safe, token, recipient, amount, versions, epoch, nonce and caps. Covered-only payments require the exact unsigned permit's full liability to be reserved before signing.

An authorization is short-lived. The worker revalidates before submission and checks the precise source event after it. If any dependency is unavailable, it holds or escalates; it does not swap in an unrestricted wallet or silently widen authority.

## When the process needs help

Use [recovery](/docs/recovery) for uncertain requests, [relay](/docs/relay) for destination reconciliation and [accounting](/docs/accounting) for externally made payments. Keep the original identities and evidence together. A failed web request is not a cancellation of a transaction already sent to the network.
