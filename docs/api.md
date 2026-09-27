# HTTP API

The application API uses JSON, cookie sessions for customer workflows, explicit tenant authorization, and integer atomic-unit monetary strings. Every live endpoint requires a configured durable database. Unconfigured dependencies return 503; they never fall back to demo state.

## Authentication

| Method and path | Purpose |
|---|---|
| POST /api/auth/challenge | Issue an origin-bound single-use wallet challenge |
| POST /api/auth/verify | Verify the exact signature and create an HttpOnly session |
| GET /api/auth/me | Current wallet and authorized workspaces |
| POST /api/auth/logout | Revoke the current server session |
| POST /api/organizations | Create a workspace owned by the signed-in wallet |

Mutations from a browser must include the configured Origin. Challenge verification currently supports EOA personal_sign signatures. Wallet authentication is application identity, not proof of Safe administration rights.

## Workspace resources

Replace {org} with an authorized workspace UUID. IDs are never authorization by themselves.

| Method and path | Purpose |
|---|---|
| GET /api/organizations/{org}/snapshot | Authorized records, payments and recent audit events |
| GET/POST /api/organizations/{org}/records/{kind} | List or create schema-validated records |
| PUT /api/organizations/{org}/records/{kind}/{id} | Update using body and expectedVersion |
| POST /api/organizations/{org}/review | Verify invoiceId against current records |
| POST /api/organizations/{org}/prepare | Prepare invoiceId with a stable key |
| POST /api/organizations/{org}/documents | Encrypted multipart file intake |
| GET /api/organizations/{org}/documents/{id} | Authenticated attachment download |
| GET/POST /api/organizations/{org}/members | Owner-only membership administration |
| GET /api/organizations/{org}/export?format=csv | Stable payment export |
| POST /api/organizations/{org}/vendor-links | Create expiring case-scoped correction access |
| POST /api/organizations/{org}/intake-keys | Create a write-only untrusted intake key |

Kinds include vendor, engagement, invoice, acceptance, case, safe, policy, consent, metric and evidence. Owner-only activation and acceptance allowlists remain enforced even when using the API directly. Client fields cannot mark an invoice paid.

## Forwarding intake

POST /api/intake uses an Authorization: Bearer intake key. Send externalId, sender, subject, text and provider. The organization and externalId pair deduplicates delivery retries. Sender provenance is retained as untrusted data; forwarding does not approve terms or payments. Connect your mail provider's authenticated webhook/forwarder to this endpoint and keep its key outside client code.

## Vendor portal

A vendor link stores its token in the URL fragment so it is not sent as a normal referrer. The browser sends it as a bearer token to GET /api/vendor and POST /api/vendor/correction. It can inspect only its assigned case and propose a correction. It cannot read the workspace or approve changes.

## Errors and retries

400 means input validation; 401 sign-in/link expiry; 403 role or tenant denial; 409 stale version or financial conflict; 429 throttling; 503 dependency unavailable. Money-moving retry logic must retain the original operation identity. Do not treat 503 as proof of non-execution.

## Intake and evidence tools

POST /api/organizations/{org}/import accepts csv and dryRun. Required columns are engagement_id, reference, amount_usdc, period_start, period_end, due_date and description. Validate first; commit imports transactionally. Source hash plus row number deduplicates identical imports. Payment eligibility still depends on obligation-level checks.

POST /api/organizations/{org}/github-evidence accepts invoiceId, owner, repo and number for a public GitHub pull request. It stores activity evidence only. It never asserts customer acceptance and does not expose an operator-wide private GitHub credential.

POST /api/organizations/{org}/safe-sync accepts safeId. It verifies the configured RPC chain and reads finalized Safe metadata, balance and bounded transfer history. A bounded scan is explicitly not complete payment history.

POST /api/organizations/{org}/extract accepts documentId and requires a configured model provider. It returns unapproved source-linked suggestions. POST /api/organizations/{org}/agent-review accepts invoiceId and constrains any proposal to deterministic allowed actions. Both operate only on authenticated tenant evidence and preserve provider/model/prompt provenance.

## Controlled changes and authorization

POST /api/organizations/{org}/destination-changes creates an immutable destination proposal. Required fields: vendorId, expectedVersion, destination, chainId, reason. A soloExceptionReason is permitted only when the database proves there is a single eligible reviewer. POST the proposal changeId to /destination-changes/confirm from a different eligible reviewer; solo confirmation instead requires a separately created fresh sign-in session after the proposal. Both operations require authentication within the previous five minutes. No transaction or funding is implied.

POST /api/organizations/{org}/history-reconciliation binds safeId, observationId, sourceDocumentIds and a statement to classifications for every observed outgoing transfer. Transfer classifications are countersign, external_invoice, or non_payable, with concrete matching references and reasons. It requires fresh owner authentication and rejects omitted/duplicate or inconsistent matches. An attestation is a human statement about the documented history scope, not proof of universal completeness.

POST /api/organizations/{org}/plan accepts policyId and persists a commitment plan from a recent confirmed balance. No forecast balance is accepted. POST /api/organizations/{org}/authorize accepts only an existing paymentId, derives all payment fields server-side, and requires the verified manifest, exact on-chain configuration, independent verifier and Circle path. It cannot be used to bypass a hold. Covered authorization first returns the exact unsigned allocation requirements; signing waits for verified collateral.
