# Payment operations desk

The console's Operations view brings outstanding obligations, committed payments, due dates and exception ownership together. Explore the [synthetic operations demo](/workspace/operations) without credentials. Real records use an authenticated, tenant-scoped PostgreSQL workspace; the demo never invokes its APIs or sends a notice.

## Read the amounts correctly

Outstanding means submitted obligation amount minus settled allocations. Committed amounts are unpaid allocations that still may execute or settle. Unallocated is outstanding minus committed, floored at zero. A failed operation only releases capacity with terminal nonexecution evidence and no source or destination transaction. A timeout, invalidation or failure label is insufficient.

Exact obligation identities are counted once across duplicate invoice IDs, using the largest submitted amount as a conservative operational view. Semantic duplicates and overlapping periods still require evidence review. Every duplicate row shares its obligation's allocation totals; do not sum those displayed rows again. Overallocated obligations show a reconciliation warning.

USD obligations stay separate from USDC. The desk cannot convert a USDC payment into discharge of a USD invoice. Confirmed cash and execution eligibility require fresh chain history, approved terms and the independent verifier. The displayed balances never authorize a payment.

The current workspace record convention stores both USD and USDC obligation amounts with six decimal places: `"125500000"` displays as `125.50 USD` or `125.50 USDC` according to the recorded currency. USD records are not reinterpreted as cents. The desk and reminder text retain every meaningful fractional digit, including `0.000001 USDC`; display never rounds a small retained commitment to zero. This convention describes application records, not an enabled fiat settlement or conversion path.

## Assign a next action

Start with the priority review queue: uncertain and destination-pending transfers first, then open exceptions, then overdue or upcoming obligations. Each real-workspace action opens the exact invoice, exception or original payment in the authenticated console. The console rechecks workspace membership and the loaded record context before showing it. Invoice reviews retain access to the terms, original documents, acceptance and reconciliation evidence. Links carry navigation hints only; opening one cannot approve or execute anything. Sample links stay inside the synthetic operations desk.

Cases can be assigned to a current owner, approver or operator, given a priority and deadline, marked awaiting evidence or approval, resolved, and reopened. Edits require the current case version; stale updates fail instead of overwriting someone else's work. Resolutions need a meaningful evidence statement.

Resolving a case queues reassessment. It cannot attest delivery, remove an invoice override, sign a payment or increase a policy. New evidence may leave the underlying invoice held. The owner must use the appropriate acceptance, correction or scoped hold workflow and review the fresh result.

Unresolved cases escalate after the workspace's configured interval or their explicit deadline. Escalation makes the case visible; it is not a privileged approval channel.

Open work is the default case view. Use **All including resolved** to revisit a resolution or reopen a case; resolved work is preserved. Cards show the linked invoice reference, responsible wallet and explicit UTC deadline when present.

The deadline editor includes UTC date and time. Updating an owner, priority or resolution preserves the existing deadline time; it does not silently move a timed case to midnight. Clear the field to remove an explicit deadline and return to the configured escalation interval.

## Reminders and quiet hours

The desk previews overdue and upcoming obligations, open exceptions and uncertain or destination-pending payments. Previewing sends nothing. Workspace owners configure reminder lead time, escalation interval, an IANA timezone and optional quiet hours. Equal quiet-hour start/end means notifications are quiet all day.

Obligation reminders show exact readable amounts in the recorded currency, the invoice's actual due date, and the owner of an open related case when one exists. Cases show their responsible wallet and explicit deadline rather than borrowing the invoice due date. Payment recovery reminders label the transfer amount as USDC even when its linked obligation uses another denomination. Daily digests include scoped review links for up to the first three priority items; the full queue stays available in the console.

Delivery requires both saved workspace opt-in and an explicitly configured worker destination. The independent operations worker supports an Observe-only workspace without a payment manifest, Circle wallet or signing key. It queues one actionable daily digest per workspace local calendar day. The executor's immediate exception notices also respect saved opt-in and quiet hours.

Quiet hours reschedule the same leased notice without consuming a retry. A provider timeout is recorded as uncertain and is never automatically resent. Operators must inspect the provider before making any later delivery decision. Telegram links open the authenticated console; they cannot approve or sign.

See [activation](/docs/activation) for configuration and [automation](/docs/automation) for payment worker boundaries. No notification destination is enabled by visiting the demo or changing sample preferences.

## Export an accounting period pack

Choose a period of at most 366 days and download JSON or CSV. The JSON pack contains settled payment records, unresolved operations, settlement ledger evidence and explicit warnings. CSV provides settled and unresolved rows with the period's completeness flag; formula-like values are escaped.

Settled payment rows use recorded settlement time. Ledger events use occurrence time, so delayed insertion does not silently move an event into another period. Historical external allocations may record observation/recognition time rather than original chain time; review them with the bookkeeper. Any unresolved operation, missing settlement ledger evidence, missing settlement/recognition time or invalid event date marks the pack incomplete. Payments missing a settlement time remain explicitly unattributed in JSON/CSV instead of silently disappearing from the close.

Exports preserve the original records. A complete operational pack is not tax certification, accounting-system compatibility, customer approval or proof that an obligation was legitimate. Reconcile with the customer's statements and bookkeeping policy before importing.
