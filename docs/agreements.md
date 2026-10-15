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

## Original sources and forwarded invoices

Upload original files in Team & settings, then select the source when creating an agreement, invoice, or acceptance. Configured extraction sends supported originals as complete inline content to a compatible selected model (OpenAI supports compatible PDF/image models; DeepSeek Flash accepts PNG/JPEG but rejects PDFs) and returns unapproved suggestions with source locations and uncertainties. Text and CSV extraction accepts up to 100,000 UTF-8 bytes and rejects longer originals. Source hashes, document commitments and provider/model/prompt provenance identify the exact input and result; they do not establish correctness or approval. Review the original before entering approved terms. If the model provider is unavailable, manual source-linked entry still works. See [invoice extraction](/docs/invoices#optional-extraction-and-activity-evidence) for format limits and invoice fields.

The Forwarded intake view exposes messages delivered by your authenticated email forwarder. Create a scoped intake key, install it in the provider webhook, and review each message before registering its invoice. The key cannot read documents, approve agreements, or pay invoices. Countersign does not operate an inbound email mailbox by itself.

## Hold a disputed invoice

An owner can place a version-specific manual hold with a reason. Clearing the hold requires fresh sign-in and a new review; it never bypasses verification. Existing transmitted operations remain subject to reconciliation and independent Safe recovery. Neither action expands coverage or future policy.

## Agreement field reference

| Field                                   | Why it matters                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Vendor                                  | Connects the agreement to the reviewed business and destination                       |
| Title and source                        | Identifies the relationship and its underlying original                               |
| Billing model                           | Retainer, milestone or hourly classification                                          |
| Currency and amount                     | Defines the obligation amount without floating-point rounding                         |
| Hourly rate and maximum quantity        | Sets atomic units per whole hour and decimal hours permitted for an hourly obligation |
| Commitment ceiling                      | Bounds cumulative paid and pending allocations                                        |
| Effective dates                         | Rejects invoices outside the approved term                                            |
| Acceptors                               | Names the customer wallets allowed to attest to delivery                              |
| Acceptance required and maximum age     | States whether acceptance is required and how long an attestation stays current       |
| Partial allowed and minimum installment | Permits exact partial amounts and optionally bounds each nonfinal installment         |
| Mode                                    | Selects Observe, Prepare or gated Delegate                                            |
| Policy                                  | Binds the engagement to the intended Safe and spending constraints                    |

The current record schema accepts USD or USDC, but a currency different from the settlement asset is held until a separately approved conversion path exists. Selecting USD does not enable automatic foreign exchange.

## Create and amend terms

An owner reviews the original and creates the draft. Check that the per-obligation amount does not exceed the cumulative ceiling and that effective dates are ordered. Record the exact acceptor wallets and choose Observe for a first review. Activation stores the authenticated approving owner and timestamp; supplied extraction fields cannot impersonate that authority.

Updates require the expected record version. Historical versions remain available for the decision record and receipts. An amendment invalidates unsubmitted authority based on the old agreement. Existing invoices remain bound to their recorded terms rather than silently moving to the latest version. An owner or approver reviews an unallocated invoice against the amendment and explicitly supplies the new `engagementVersion` in its version-checked update. This keeps its period and obligation identity. Allocated or settled invoices require independent reconciliation or a separate adjustment. An existing engagement cannot be reassigned to another vendor.

## Record customer acceptance

The current API accepts an engagement ID, invoice ID, engagement version, statement, expiry and optional source document. It derives the actor, acceptance time, obligation and invoice version from authenticated records. Only an owner or approver named in the current terms can attest. An acceptance record cannot be edited; create a new attestation when appropriate.

The agreement sets `acceptanceMaxAgeSeconds`, defaulting to 24 hours and supporting a positive age of up to 30 days. An earlier explicit attestation expiry shortens that window. Material invoice corrections stale earlier acceptance; settlement bookkeeping preserves its material terms binding. An owner or the original authorized acceptor can withdraw an attestation with a recorded reason. Withdrawal invalidates unsubmitted application authority for that invoice, while submitted or signed operations still need independent reconciliation or Safe recovery. A required acceptance cannot be replaced by a vendor correction, a model explanation or a GitHub merge.

## Hourly work and installments

Approved hourly terms require a positive `hourlyRate` in atomic units per whole hour and a positive `maximumQuantity` in decimal hours. Invoices provide `quantity` with at most six decimal places. For example, a 2 USDC hourly rate (`"2000000"`) multiplied by `"1.25"` hours allows at most `"2500000"` atomic units. The verifier rejects excess quantities, amounts over the derived charge, and a calculation that would need fractional atomic units. Missing draft quantities remain requests for evidence. The commitment ceiling still bounds all settled and reserved allocations across the engagement.

Retainer and milestone records use their approved per-obligation amount and reviewed period identity. Partial preparation accepts a specifically requested atomic amount only when the engagement permits installments and any nonfinal minimum is satisfied. Omitting the requested amount selects the invoice's unallocated remainder. Existing operations retain their original amount and identity through retries and independent revalidation. Another installment can be prepared after the earlier operation settles or is proven not to have executed.

For the exact rules and limitations see [verification](/docs/verification), [domain invariants](/docs/domain) and [API reference](/docs/api).
