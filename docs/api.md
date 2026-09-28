# HTTP API

The application API uses JSON, cookie sessions for customer workflows, explicit tenant authorization, and integer atomic-unit monetary strings. Customer workflows require a configured durable database. The public `GET /api/health` endpoint reports configuration status without requiring database access. Unconfigured dependencies return 503; they never fall back to demo state.

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

## Scoped owner overrides

POST /api/organizations/{org}/override accepts invoiceId, expectedVersion, action (hold or clear_hold), and a reason of at least ten characters. Only owners can apply an override. Hold narrows application authority and invalidates eligible unsubmitted intents. Clear_hold requires a sign-in within five minutes and returns the invoice to review; it cannot force payment, change destinations, widen policy, or clear an unresolved submitted operation. The immutable event reports the coverage consequence. An application hold does not revoke an already signed on-chain permit, even before broadcast. Owners must use independent on-chain pause or revocation controls when required; already submitted or uncertain operations retain their identity and require reconciliation.

GET /api/organizations/{org}/documents lists attachment metadata in the current tenant. GET /api/organizations/{org}/intake-events returns the latest 200 untrusted forwarded messages for review. Source content never activates agreements or authorizes payment.

GET /api/organizations/{org}/payments/{paymentId}/receipt downloads the immutable bound decision receipt. Incomplete or inconsistent evidence is rejected rather than inventing proof. POST /api/organizations/{org}/payments/{paymentId}/relay-transaction accepts transactionHash and note to attach a destination candidate for worker verification. Attaching a candidate never marks a payment settled.

## Request and response conventions

Use the deployment origin that issued the session. Browser mutations send the matching `Origin`, `Content-Type: application/json` for JSON, and the session cookie. Document uploads use multipart form data with a `file` field. Intake and vendor bearer credentials are deliberately separate from customer sessions.

Successful resource responses return the documented object or array. Service errors have a structured `error` object with `code` and `message`; inspect both the HTTP status and the code. Never log session cookies, intake tokens or complete vendor links.

The workspace snapshot returns up to 2,000 records, 200 payments and 100 recent audit events. Document and forwarded-intake lists return up to 200 recent entries. These bounded views are not a guarantee of complete historical export. The current snapshot's `executionEnabled` field is conservatively false; do not infer route readiness from a snapshot alone.

## Example: review an existing invoice

This example runs in an authenticated browser on the configured deployment. `organizationId` and `invoiceId` must come from records the signed-in user is authorized to access. It creates a review record but does not prepare or submit a payment.

```javascript
const response = await fetch(`/api/organizations/${organizationId}/review`, {
  method: "POST",
  credentials: "same-origin",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ invoiceId }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error?.message ?? "Review failed");
const { action, executable, findings, validUntil } = result.decision;
```

Read the findings and validity along with the action. A PAY result does not grant authority beyond the engagement mode. The request requires owner, approver or operator membership.

## Example: versioned record update

Record creation accepts the record fields directly or wrapped in `body`. Updates should use a wrapper containing the complete schema body and current `expectedVersion`; do not submit only a partial patch and assume unspecified fields are retained.

```json
{
  "expectedVersion": 2,
  "body": {
    "name": "Example vendor",
    "reference": "VENDOR-001",
    "destination": "0x1111111111111111111111111111111111111111",
    "chainId": 1,
    "verified": false,
    "verificationNote": ""
  }
}
```

This is illustrative vendor data, not a verified settlement destination. Send it only to the intended existing vendor record in a test workspace; a production address change must use the separate controlled workflow. A stale version returns 409, and an ordinary update cannot change the trusted destination or chain.

## Preparation and idempotency

Preparation accepts `{ invoiceId, key }`, where the stable key is 8–160 characters. Authorization accepts `{ paymentId }` for the already stored payment. Amount, destination, versions and permit fields are derived by the server; neither endpoint accepts a model-generated arbitrary transaction.

Keep the same key for a retry of the same preparation. A key used for a different invoice returns a conflict. If an operation is invalidated or submission becomes uncertain, reconcile it instead of choosing another key. See [payments](/docs/payments) and [recovery](/docs/recovery).

## Additional read and export surfaces

`GET /api/organizations/{org}/records/{kind}/{id}` returns one authorized record. `GET /api/organizations/{org}/destination-changes` lists proposals for owners and approvers. `GET /api/organizations/{org}/export` returns a versioned JSON payment export; add `?format=csv` for the escaped CSV attachment. These exports contain financial metadata and remain private workspace data.

`GET /api/health` is public liveness/configuration information; `GET /api/ready` checks database readiness. A successful health response is not proof of Circle configuration, Safe authority or funded protection. A 503 after a financial submission must not be interpreted as evidence of nonexecution.

## Schema scope and implemented limits

The source of truth for record validation is `src/lib/server/records.ts`. Domain capabilities can be broader than the current HTTP record schema: for example, hourly quantities and explicitly requested partial amounts exist in the verifier model but are not fully exposed through the current invoice preparation path. Consult [agreements](/docs/agreements), [verification](/docs/verification) and [agents](/docs/agents) before building an assistant around those fields.
