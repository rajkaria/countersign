# Why payments should understand the agreement

A recurring amount is not necessarily a duplicate, and a new invoice number is not necessarily a new debt. To distinguish them, a payment review needs the obligation behind the invoice.

Countersign represents the agreement as versioned terms and links each invoice to the relevant period or obligation. That makes the business question explicit before a transaction is prepared.

## A recurring invoice needs a period

Imagine an illustrative 800 USDC monthly retainer. September and October can legitimately have the same amount. A second September invoice with a changed reference cannot create another 800 USDC obligation merely by looking different.

The review compares the engagement, period and prior settled or pending allocations. It also flags overlapping periods for investigation. This is more meaningful than comparing invoice numbers alone, but it still depends on correct approved terms and a complete enough record of payments.

## An amendment needs a version

Now suppose the parties change the retainer to 1,000 USDC from November. The business must approve the amended terms and effective dates. That approval should not rewrite why September was paid or cause an earlier invoice to inherit a later authorization.

Countersign preserves historical record versions. An invoice tied to older terms can produce a mismatch after an amendment, requiring explicit review. The inconvenience is deliberate: a changed agreement should be visible at the payment boundary.

## Delivery evidence needs an acceptor

A merged pull request, submitted design or logged activity can support a review. Whether it satisfies the contractual condition depends on the agreement and the authorized customer's acceptance.

Countersign stores activity separately from acceptance. The acceptor must be currently allowed for the exact terms and obligation, and the attestation must remain valid. That prevents a vendor or model from turning evidence of activity into self-issued permission to pay.

## An installment needs an allocation

A partial payment is not permission to forget the remainder or pay the same portion twice. Approved partial terms, prior allocations and the commitment ceiling all matter. Pending and uncertain operations must count until nonexecution or settlement is established.

The console and preparation API support exact partial amounts and approved minimums. Omitting an amount selects the unallocated remainder; existing uncertain operations retain their identity and block a new preparation. Hourly terms and decimal billed quantities flow through the same deterministic checks. These software workflows still require separate external activation for real execution. See [agreements](/docs/agreements) and [verification](/docs/verification).

## A destination needs its own review

An invoice is a poor authority for updating a trusted wallet address because the same document requests the payment and proposes where it should go. Countersign uses an independently verified vendor register and a separately authenticated destination-change workflow.

A changed address can be legitimate. The goal is to preserve the evidence and authority for the change, then recheck the payment against that version. It is not to assume every change is fraud or to ignore the risk because the invoice is familiar.

## Make the reason portable

A receipt should explain the decision's versioned basis, permit binding and recorded settlement references. It cannot establish work quality or replace independent chain verification, but it gives reviewers a stable record of what the system relied on.

Agreement-aware payment operations are useful when they make obligations, exceptions and authority understandable to the people responsible for them. Read [agreements](/docs/agreements), [vendors](/docs/vendors), [accounting](/docs/accounting) and [receipts](/docs/receipts) for the implemented workflow.
