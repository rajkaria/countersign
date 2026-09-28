# Accounting, exports and reconciliation

Countersign keeps an operational subledger so a reviewer can distinguish an obligation, a reservation, funds in transit and a completed vendor payment. It supplies evidence for bookkeeping; the chart of accounts, tax treatment and period close still need review against the business's actual accounting process.

## Separate the financial events

| Event | Interpretation |
|---|---|
| Recognition | A recorded payable or other accounting event |
| Reservation | A commitment consuming available capacity; cash has not moved |
| Transit | Funds left the source but cross-chain delivery remains incomplete |
| Settlement | Independently verified delivery under the payment's exact constraints |
| Fee | A separate cost with its own balanced postings |
| Credit or refund | A separately authorized adjustment or compensating transfer |
| Reversal | A new event linked to the original, preserving the audit history |

The domain ledger validates balanced postings per asset. It cannot balance USDC against a different asset just because their human-readable numbers look similar. Corrections append reversal or adjustment events; historical events are not edited away.

## Money and precision

Application and receipt amounts are decimal strings of nonnegative atomic units. Arithmetic uses integers. For a verified six-decimal USDC deployment, 1 USDC is `"1000000"` and 0.01 USDC is `"10000"`. The domain conversion rejects excess precision rather than rounding it silently.

A different invoice currency requires a separately approved conversion path. The current verifier holds a USD-denominated invoice against a USDC settlement asset rather than inventing an exchange rate. Standard CCTP execution currently requires zero fees so delivered principal equals the authorized amount. Nonzero-fee accounting is a future activation gate, not an implicitly supported deduction.

## Reconcile a manual payment

1. Refresh the Safe's finalized balance and bounded outgoing transfer history.
2. Gather the supporting statement or other original documents for the scope being reconciled.
3. An owner signs in freshly and classifies every observed outgoing transfer as a Countersign payment, an external invoice payment, or a non-payable transfer.
4. Include concrete payment/invoice matches or a reason for a non-payable classification. Omitted, duplicate or inconsistent classifications are rejected.
5. Review the resulting invoice allocation and rerun verification before another payment.

An unexplained manual transfer can have paid the same obligation. It must not be ignored simply because Countersign did not initiate it. A bounded scan is not complete history; the owner must document its scope. See [automation](/docs/automation).

## Export records

The organization export endpoint returns versioned JSON by default and an escaped CSV with `?format=csv`, scoped to authorized members. The domain ledger export utilities also provide deterministic CSV and versioned JSON for ledger events. Stable external identities allow downstream deduplication; conflicting records with the same identity should be investigated instead of summed twice.

Exports preserve payment identifiers, states, exact values and source/destination references. CSV escaping also neutralizes spreadsheet formula prefixes. Keep raw exported files private: redaction of narrative fields does not make wallet addresses, amounts and times anonymous.

For a payment-specific explanation, download its [portable receipt](/docs/receipts). A prepared or pending receipt is useful for review but is not evidence that a payable was settled.

## Settlement is posted once

The worker atomically inserts an idempotent settlement event, updates the payment, preserves the prior invoice version and records paid or partially paid status. Repeated callbacks cannot add the same settlement twice. For a cross-chain payment, source burn records progress; final destination proof is required before settlement.

A reserve compensation payout is separate from the original vendor payment and must not be counted as a reversal of that transfer. Never count prefunding, source burns and destination mints as three vendor payments.

## Practical review before close

Compare source and destination evidence with the obligation register, outstanding amounts, reserved or uncertain payments and exported ledger. Ask the bookkeeper to review account mappings, treatment of fees/credits and the period cutoff. Investigate every unmatched or uncertain item before treating the export as a complete business ledger.

Read [payments](/docs/payments), [receipts](/docs/receipts) and [settlement is not a transaction hash](/docs/settlement-is-not-a-hash).
