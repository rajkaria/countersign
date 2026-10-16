# Pay what you agreed. Know why.

Countersign brings agreements, invoices, customer acceptance, and payment history into one review. Routine obligations become clear. Exceptions come with the evidence you need to resolve them.

## Explore before connecting anything

Start with the [guided walkthrough](/review): five synthetic cases use the production verifier. Inspect missing acceptance, changed terms, partial allocations, renamed duplicates and an uncertain original operation. No wallet, model key or funds are required.

Go deeper in the [sample workspace](/workspace). Review invoices, resolve a missing acceptance, inspect the plan and try recovery. Local demo edits may survive refresh in your browser; they are not payment records and cannot spend funds. Read [a payment, end to end](/docs/payment-lifecycle) for the full mental model.

The [private workspace](/login) uses Ethereum wallet sign-in. Signing the authentication message grants no spending rights. No seed phrase or private key is requested. The current login supports externally owned wallets; a Safe connection is a separate read-only record.

External-wallet signing instructions are below. You can learn the review flow before signing in.

## Your first review

- Create a named workspace. Its owner is the authenticated wallet that creates it.
- Register a vendor and independently verify the business relationship and settlement address. A wallet signature alone does not prove business identity.
- Add the agreement, effective period, billing amount, total ceiling, and authorized customer acceptor. Activate terms only if you are authorized to do so.
- Add an invoice against that agreement. Keep the original in encrypted private document storage.
- Run verification. A hold explains the missing or conflicting evidence. An authorized customer confirms delivery when the agreement requires acceptance.
- Review again after changes. An earlier decision never silently authorizes revised terms.

## Three modes of trust

| Mode     | What Countersign can do                             | What you retain                                          |
| -------- | --------------------------------------------------- | -------------------------------------------------------- |
| Observe  | Inspect records and explain discrepancies           | Every signing right                                      |
| Prepare  | Prepare a fully explained payment proposal          | Human transaction approval                               |
| Delegate | Execute an eligible payment within installed limits | Safe owners, threshold, pause and independent revocation |

Live delegation is gated until the specific deployment has passed Circle compatibility, Safe installation, chain configuration, independent review, and an explicitly approved allocation. The current [release status](/docs/release-status) states which gates have actually passed.

## Invite your team

Owners manage vendors, terms, policy previews and memberships. Approvers can record acceptance only when the engagement names their wallet. Operators import and investigate. Viewers inspect records. A role never grants more on-chain authority than the Safe owners installed.

## When a payment needs attention

Open a case from the invoice. Give it a clear discrepancy and next action. A private vendor correction link exposes only that case, expires after seven days, and does not let a vendor approve a payment or change the trusted destination. See [agreements and acceptance](/docs/agreements).

## Check deployment readiness first

The public site and demo do not require payment credentials. A private workspace requires configured durable storage and document encryption. Production storage is activated and has been exercised with a hypothetical workspace, tenant checks and a logical restore. These are synthetic checks, not customer or payment evidence. Financial execution remains disabled. If a configuration error appears, an operator must resolve [deployment readiness](/docs/deployment); real records are never stored in a temporary memory fallback.

`GET /api/health` reports application availability. `GET /api/ready` checks database readiness. Neither proves a Safe module is installed or a payment route is ready. Consult [release status](/docs/release-status) for the verified boundary.

## A complete first workflow

1. Sign in with an externally owned Ethereum wallet and create the workspace when persistence is configured.
2. Add team members under their appropriate application roles. Record who is authorized to accept delivery for each engagement.
3. Register the [vendor](/docs/vendors), independently verify its destination and upload the original agreement.
4. Approve versioned [terms](/docs/agreements) in Observe mode with the amount, period, ceiling and acceptance requirement.
5. Register the Safe read-only and a policy, then refresh and reconcile the observed history. An observation is not spending authority.
6. Import or enter the [invoice](/docs/invoices), link its original and run [verification](/docs/verification).
7. Resolve findings through the responsible person. Rerun review whenever terms, evidence or history change.
8. Inspect [cash planning](/docs/planning), retain an explainable decision and review [accounting](/docs/accounting) outputs. Advance mode only through the explicit authority process.

## Feature directory

If a review is blocked, use [Resolve a finding](/docs/troubleshooting) to identify the responsible person and next step.

| What you want to do                                  | Guide                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Understand the use case                              | [Why Countersign](/docs/why-countersign)                          |
| Register a vendor or change a destination            | [Vendors](/docs/vendors)                                          |
| Define terms and customer acceptance                 | [Agreements](/docs/agreements)                                    |
| Upload, forward or bulk import invoices              | [Invoice intake](/docs/invoices)                                  |
| Explain an approval, hold or evidence request        | [Verification](/docs/verification)                                |
| Reserve cash for competing obligations               | [Planning](/docs/planning)                                        |
| Reassess standing obligations and operate a worker   | [Automation](/docs/automation)                                    |
| Understand execution and cross-chain delivery        | [Payments](/docs/payments) and [relay](/docs/relay)               |
| Reconcile manual payments and export records         | [Accounting](/docs/accounting)                                    |
| Download and independently inspect a decision record | [Receipts](/docs/receipts)                                        |
| Limit access and recover from failures               | [Security](/docs/security) and [recovery](/docs/recovery)         |
| Understand reserved liability and claims             | [Protection](/docs/protection)                                    |
| Integrate an application or assistant                | [API](/docs/api) and [agents](/docs/agents)                       |
| Deploy and maintain the service                      | [Deployment](/docs/deployment) and [operations](/docs/operations) |
| Evaluate whether it helps                            | [Evidence and evaluation](/docs/evaluation)                       |

## Application role reference

| Role     | Typical capabilities                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| Owner    | Manage vendors, agreements, policies and membership; perform controlled owner actions        |
| Approver | Review/import records, prepare eligible payments and attest when named in the engagement     |
| Operator | Intake, evidence collection, cases, reviews and payment preparation; no agreement activation |
| Viewer   | Inspect authorized records and export accessible payment information                         |

Creating vendor correction links requires an owner or approver. Intake-key creation requires an owner. Acceptance requires both an owner/approver role and inclusion in the agreement's acceptor list. Membership administration currently adds or updates approver, operator and viewer roles; it is not a Safe-owner management interface.

## Sign with an external wallet

For a wallet kept outside the browser, choose **Sign with an external wallet** on [sign-in](/login). Enter its public Ethereum address, create a challenge and copy the exact displayed message. Sign the complete UTF-8 text with EIP-191 (`personal_sign`) in OWS or another EOA wallet, then paste the 65-byte hexadecimal signature and complete sign-in.

Keep every line break; do not sign a transaction or a message hash. The challenge expires after five minutes and can be used once. Editing the address discards the old challenge and signature. Address/signature edits pause while the server verifies the signature and creates the normal session cookie. Private keys stay in your wallet. Application login grants no spending permission.
