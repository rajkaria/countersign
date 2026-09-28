# Intake, evidence and invoice review

An invoice records a request for payment. Countersign matches that request to an approved agreement, an obligation, a trusted destination, customer acceptance and prior allocations. Uploading or importing an invoice never authorizes a transfer.

## Ways to bring in an invoice

| Method | Useful for | What happens |
|---|---|---|
| Manual entry | A small number of reviewed invoices | Enter the vendor, agreement, reference, amount, period, due date, destination and description |
| Original document | Keeping the underlying evidence | Upload an encrypted source and link its ID to the invoice or agreement |
| CSV import | Repeating an existing structured workflow | Validate the whole file, then import approved rows transactionally |
| Forwarded intake | Invoices delivered through an existing mail provider | Store an untrusted message for an operator to review and register |
| Optional extraction | Reading an agreement source | Receive source-linked suggestions and uncertainties for human review |

The original-document store accepts supported PDF, image, CSV and text files up to 4 MB. It encrypts content with AES-256-GCM and tenant-bound authenticated data. Downloads require organization access and are served as attachments. Keep the encryption key backed up separately from the database.

## Review the fields before saving

Select the existing vendor and engagement. The server binds a new invoice to the current engagement version and trusted destination version, derives its obligation identity from the engagement and billing period, and starts it as received with zero paid amount. A submitted field cannot mark it paid.

Use canonical atomic-unit strings in JSON. For verified six-decimal USDC, 125.50 USDC is represented as `"125500000"`. The CSV import uses human-readable decimal USDC instead; do not put atomic units in the `amount_usdc` column.

Check the original reference, period, amount, due date, destination and description. A valid schema does not establish that the underlying invoice is genuine or payable.

## Import a CSV

Required unique column names are shown below. Replace the illustrative engagement placeholder with an actual UUID from your authorized workspace before use.

```csv
engagement_id,reference,amount_usdc,period_start,period_end,due_date,description
<engagement-uuid>,INV-SEP-001,125.50,2026-09-01,2026-09-30,2026-10-05,September services
```

1. Send the CSV with `dryRun: true` to the organization import endpoint.
2. Review every row result. Fix missing agreements, invalid periods, nonpositive amounts, inconsistent columns or amounts with more than six decimal places.
3. Import the same corrected text with `dryRun: false`.
4. Review and verify the created invoices against their obligations.

Files are limited to 1 MB and 500 invoice rows. Exact file-and-row retries are deduplicated using a source commitment. Changing the CSV text can create a new intake identity, so import deduplication is not a substitute for obligation-level allocation checks. A committed import aborts transactionally on a failed row.

## Forward invoices from your mail provider

Create a scoped intake key and configure your existing authenticated forwarder to call `POST /api/intake`. It submits `externalId`, `sender`, `subject`, `text` and `provider`. The workspace and external ID deduplicate delivery retries. Countersign does not provision an inbound mailbox.

Review forwarded messages before creating records. The sender field and message content remain untrusted. An intake key can submit intake; it cannot read originals, activate agreements or pay invoices.

## Optional extraction and activity evidence

The configured model can suggest agreement fields with source locations and uncertainties. The response is explicitly an unapproved suggestion. Missing or contradictory dates, amounts and acceptance conditions need review of the original. Manual source-linked entry remains available when extraction is unconfigured or fails.

You can attach a public GitHub pull request as evidence of activity. A merged pull request does not satisfy contractual acceptance. Only the currently authorized customer acceptor can provide the relevant attestation. See [agreements](/docs/agreements).

## Correcting an invoice

Edits use optimistic version checks. Refresh after a conflict rather than overwriting another person's work. An invoice cannot be silently reassigned to a different vendor, engagement or billing period. Committed invoices require reconciliation or a separate adjustment. Paid amounts are maintained by verified settlement, not editable client fields.

An owner may hold a specific invoice version with a reason. Clearing that hold requires fresh authentication and returns it to verification; it cannot force payment. See [verification](/docs/verification) and [accounting](/docs/accounting).
