# Every payment starts with an obligation

An invoice says what a vendor is asking for. The approved engagement says what the customer agreed to pay. Countersign keeps those records separate.

## Versioned terms

Engagements record the vendor, billing model, effective dates, per-obligation amount, total commitment ceiling, acceptance conditions and permitted partial payments. Activation is an owner operation. Changes create immutable historical versions and trigger reassessment. Optimistic version checks reject stale edits.

Retainers identify each billing period separately. A repeated monthly amount is legitimate when it belongs to a different approved period. Milestone and hourly records need their specific allocation and quantity evidence; incomplete terms produce a request for evidence rather than a guessed payable.

## Acceptance is not activity

A merged pull request, logged hour, or uploaded file can be useful evidence. It does not automatically establish contractual acceptance. The current customer acceptor must attest against the correct agreement version and obligation. Acceptances expire; stale, revoked, future-dated or unauthorized attestations cannot release a payment.

## Duplicates and installments

The verifier totals settled and pending allocations for the obligation and engagement. Changing an invoice number cannot create a new obligation. Partial payments require approved partial terms and leave the unpaid remainder visible. Pending or uncertain operations continue consuming capacity.

Manual payments must be matched before automation resumes. An unexplained external transfer is a reconciliation exception, not a reason to guess that nothing was paid.

## Destination changes

Invoices, forwarded mail, and vendor corrections cannot overwrite the trusted register. A destination change needs a separate authenticated review using a previously established contact channel. Preserve the old destination version and invalidate pending authority. Solo-operator exceptions must be labeled as such; they are never represented as two-person review.

## Originals and extraction

PDFs, images, CSV and text originals are encrypted with AES-256-GCM and tenant-bound additional authenticated data. Uploads are capped at 4 MB and downloaded as attachments. Source text and model extraction remain untrusted suggestions. An owner must review the exact terms before activation.
