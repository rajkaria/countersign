# Intake, evidence and invoice review

An invoice records a request for payment. Countersign matches that request to an approved agreement, an obligation, a trusted destination, customer acceptance and prior allocations. Uploading or importing an invoice never authorizes a transfer.

## Ways to bring in an invoice

| Method              | Useful for                                           | What happens                                                                                  |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Manual entry        | A small number of reviewed invoices                  | Enter the vendor, agreement, reference, amount, period, due date, destination and description |
| Original document   | Keeping the underlying evidence                      | Upload an encrypted source and link its ID to the invoice or agreement                        |
| CSV import          | Repeating an existing structured workflow            | Validate the whole file, then import approved rows transactionally                            |
| Forwarded intake    | Invoices delivered through an existing mail provider | Store an untrusted message for an operator to review and register                             |
| Optional extraction | Reading an invoice or agreement original               | Receive source-linked suggestions and uncertainties for human review                          |

The original-document store accepts supported PDF, image, CSV and text files up to 4 MB. It encrypts content with AES-256-GCM and tenant-bound authenticated data. Downloads require organization access and are served as attachments. Keep the encryption key backed up separately from the database.

## Review the fields before saving

Select the existing vendor and engagement. The server binds a new invoice to the current engagement version and trusted destination version, derives its obligation identity from the engagement and billing period, and starts it as received with zero paid amount. A submitted field cannot mark it paid.

Use canonical atomic-unit strings in JSON. For verified six-decimal USDC, 125.50 USDC is represented as `"125500000"`. The CSV import uses human-readable decimal USDC instead; do not put atomic units in the `amount_usdc` column.

For hourly work, also enter `quantity` as a decimal hour string with at most six decimal places, such as `"1.25"`. The agreement supplies the approved rate and maximum quantity. The server checks the charge using integer arithmetic and holds a charge that would need fractional atomic units rather than rounding it.

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

Hourly CSV rows require an additional `quantity` column, containing decimal hours with at most six decimal places. `amount_usdc` must still contain the invoice amount; quantity does not manufacture a charge or approval. This import accepts USDC agreements; review invoices in other currencies through the currency-specific workflow.

Files are limited to 1 MB and 500 invoice rows. Exact file-and-row retries are deduplicated using a source commitment. Changing the CSV text can create a new intake identity, so import deduplication is not a substitute for obligation-level allocation checks. A committed import aborts transactionally on a failed row.

## Forward invoices from your mail provider

Create a scoped intake key and configure your existing authenticated forwarder to call `POST /api/intake`. It submits `externalId`, `sender`, `subject`, `text` and `provider`. The workspace and external ID deduplicate delivery retries. Countersign does not provision an inbound mailbox.

Review forwarded messages before creating records. The sender field and message content remain untrusted. An intake key can submit intake; it cannot read originals, activate agreements or pay invoices.

## Optional extraction and activity evidence

The configured model can suggest invoice or agreement fields with source locations and uncertainties. With a compatible OpenAI model, PDF originals are sent inline as files and PNG/JPEG originals as images. DeepSeek Flash supports text/CSV and inline PNG/JPEG; DeepSeek Pro supports text/CSV only. The DeepSeek adapter rejects PDFs and unsupported image/model combinations before sending any source. See [provider configuration](/docs/deployment#optional-model-provider). The complete original is used, with a 4 MB limit for these formats. Text and CSV extraction requires valid UTF-8 and at most 100,000 bytes; a longer original is rejected rather than silently truncated. The selected model must support the source format and structured output. Provider credentials and any provider costs must be configured separately.

Invoice suggestions preserve the vendor name, reference, amount, currency, quantity, service period, due date, description and claimed destination as source text. An absent field remains null. Review decimal amounts before entering atomic units, distinguish a due date from a service period, and verify any destination independently against the trusted vendor register. Extraction cannot create an invoice, approve an agreement, register a destination or prepare payment.

The response is explicitly an unapproved suggestion. Its provenance contains the source document ID, complete-source SHA-256, encrypted-document commitment, filename, MIME type, byte count, provider response ID, model, prompt version and extraction time. These are private workspace metadata. A hash identifies the bytes used; it does not prove that the source is true or that a source location is accurate. A provider refusal, incomplete result or invalid structured output produces no successful extraction record. Missing or contradictory facts still need review of the original. Manual source-linked entry remains available when extraction is unconfigured or fails.

You can attach a public GitHub pull request as evidence of activity. A merged pull request does not satisfy contractual acceptance. Only the currently authorized customer acceptor can provide the relevant attestation. See [agreements](/docs/agreements).

## Correcting an invoice

Edits use optimistic version checks. Refresh after a conflict rather than overwriting another person's work. An invoice cannot be silently reassigned to a different vendor, engagement or billing period. Committed invoices require reconciliation or a separate adjustment. Paid amounts are maintained by verified settlement, not editable client fields.

An owner or approver can explicitly rebind an unallocated invoice to an amended agreement by sending its reviewed current `engagementVersion` in the version-checked update. This preserves the original engagement, billing period and obligation identity. Omitted agreement versions preserve the existing binding. Allocated or settled invoices require reconciliation or a separate adjustment. A rebind creates new material invoice terms, so obtain fresh acceptance where required.

After the controlled vendor destination workflow, an owner or approver can review an unallocated invoice's destination again. Supply the current trusted address, `destinationVersion` and `destinationChainId`; the server checks all three against the register. This cannot replace the separate vendor destination approval process.

## Prepare an installment and track the remainder

Approved partial-payment terms can include an atomic `minimumPartial`. Review or prepare a specific installment with `requestedAmount`, using the same atomic-unit convention as the invoice. Omitting this field selects the unallocated remainder. For example, after a confirmed 300 USDC settlement on an 800 USDC invoice, the next proposal defaults to 500 USDC.

The review response includes `balance` with atomic `invoiced`, `settled`, `reserved` and `remaining` amounts. Confirmed settlement reduces the unpaid balance; prepared, submitted, uncertain and unproven failed operations retain their reservation. Only one unresolved payment operation is permitted for the invoice at a time.

Keep the original stable key for every retry of the same installment. A retry cannot change its invoice or amount. Use a new key for a separately reviewed next installment after the preceding operation settles or independent evidence establishes terminal nonexecution. An invalidated signed operation does not free its reservation or revoke its on-chain authority.

Settlement bookkeeping advances the invoice record version but retains its material `termsVersion`. A valid acceptance of unchanged delivery can therefore support the remainder until its own expiry or approved age limit. Correcting contractual invoice fields advances material terms and requires fresh acceptance.

An owner may hold a specific invoice version with a reason. Clearing that hold requires fresh authentication and returns it to verification; it cannot force payment. See [verification](/docs/verification) and [accounting](/docs/accounting).
