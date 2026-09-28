# Settlement is not a transaction hash

A transaction hash identifies a transaction to investigate. It does not by itself prove that the intended vendor received the intended asset and amount on the intended chain. A reliable payment record needs the matching effect and finality, not simply a string returned by a provider.

## Follow the state, not the optimism

A payment starts as a prepared intent. Authorization binds it to exact approved fields. Submission sends the operation to a provider. Source confirmation proves the approved source execution under the required checks. Cross-chain destination settlement is a further event.

Each stage answers a different question. Treating “submitted” as “paid” hides provider timeouts, reverted transactions, wrong-chain evidence and unfinished cross-chain delivery.

## The cross-chain example

Consider an illustrative 800 USDC payment through the supported standard CCTP route. The source burn can be confirmed while destination delivery remains pending. The attestation then supplies evidence for receiving the corresponding message; it is not itself the vendor's destination mint.

Countersign binds the source transaction to the exact route and message. Destination verification checks a successful finalized transaction, the matching message nonce and body, the destination contracts and the exact native USDC mint to the approved recipient. An unrelated transfer of the same amount cannot settle this payment.

The current standard route requires zero maximum and executed fees. A fee-bearing route cannot be treated as a full 800 USDC delivery without separately reviewed gross/net/fee accounting. See [relay](/docs/relay).

## A timeout is a question

If the worker times out after calling a provider, the transaction may still have been submitted. Creating a fresh payment ID to try again could duplicate the economic effect.

Countersign preserves the original intent, permit, provider idempotency key and any transaction references. The operation becomes uncertain or recovery required until independently reconciled. Reserved capacity remains consumed. Even a provider-reported failure needs appropriate nonexecution evidence before capacity is released.

This is why a 503 response or a missing transaction hash must never automatically mean “nothing happened.” Read [recovery](/docs/recovery).

## Manual evidence remains a candidate

An authorized operator may attach an existing destination transaction to help reconciliation. The act is audited but does not mark the invoice paid. The worker independently checks the candidate against the original payment and route. An incorrect or unfinalized candidate remains unconfirmed.

That distinction lets humans help recover an operation without giving a free-form form field the authority to manufacture settlement.

## Accounting follows verified delivery

For a cross-chain payment, source funds may be in transit while the vendor obligation remains unsettled. When verified delivery arrives, the worker posts settlement and updates the invoice atomically and idempotently. Duplicate callbacks cannot create additional vendor volume.

The portable receipt records the decision, exact authorization binding and settlement references when present. Offline integrity verification proves consistency of committed fields; it cannot independently prove chain finality, completeness of records or the quality of the work. A prepared or pending receipt can legitimately have no settlement section.

## What to ask when someone says “paid”

Ask which payment identity is being discussed, which chain and recipient received funds, what amount and asset arrived, how finality was verified, and how the result maps to the original obligation. Those questions produce a useful operational answer even when the honest result is “source confirmed; destination pending.”

Read [payments](/docs/payments), [receipts](/docs/receipts) and [accounting](/docs/accounting) for the implementation details. The examples here are explanatory; they do not assert real settlement by the current deployment.
