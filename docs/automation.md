# Standing automation with bounded authority

Standing automation repeatedly checks approved obligations as time, evidence and cash change. Its authority comes from existing owner-approved terms and installed limits. It does not obtain new authority simply because a worker is running.

## Observe, Prepare and Delegate

| Mode | Ongoing behavior | Release boundary |
|---|---|---|
| Observe | Evaluate records and surface missing evidence | No prepared payment or spending authority |
| Prepare | Identify and prepare eligible human-reviewed work | Existing human signing process |
| Delegate | Attempt authorization of due eligible obligations | All manifest, permit, policy, coverage and chain gates |

Mode belongs to an engagement. A business can keep most engagements in Observe while reviewing a narrowly bounded Delegate engagement. A workspace role or wallet login does not install a Safe module.

## What a standing scan does

The scan reads open invoices, engagements, policies, current membership and existing payment intents. It requires approved standing terms, an identifiable approving owner who is still an owner, and a selected policy. It verifies the obligation and groups candidates by the same Safe before planning against a shared confirmed balance.

Missing terms or authority produce an actionable request. Stale or unreconciled history holds the relevant work. A due eligible Delegate item can proceed to the normal preparation and authorization functions only when deployment readiness passes. An item awaiting funded coverage stays unsigned and unexecuted. The scan limits itself to 500 open invoices; larger workspaces need an explicit partitioning plan before automatic execution.

The result is an auditable outcome with invoice and policy versions, finding information and any payment identity. A scan outcome saying authorized is not a destination-settlement confirmation.

## The persistent worker

The worker periodically refreshes read-only Safe observations, reassesses standing obligations and handles durable outbox jobs. A Vercel deployment alone is not a persistent worker or Circle wallet profile.

Jobs use database leases with fencing tokens, a 90-second lease, bounded exponential backoff and eight automatic attempts. A stale worker cannot complete another worker's lease. Exhausted jobs remain visible for an operator; they are not deleted to make the queue look healthy.

Before submission the worker rechecks current authority and stores the submitted state durably. A crash or unknown provider outcome retains the original payment identity and reserved capacity. Reconciliation looks up that original operation rather than making a new payment.

## Continuous observation has a boundary

An RPC transfer scan is bounded and starts with `historyComplete: false`. An owner establishes a reconciled baseline using documentary evidence and explicit classifications for observed outgoing transfers. Later observations may extend that baseline only when continuity and supporting independently observed history hold. A gap or unknown outgoing transfer stops automatic reliance on the baseline.

An owner attestation is evidence about the recorded scope; it is not proof that every historical liability has been discovered.

## Notifications

The optional Telegram notification adapter is operator-configured and separate from execution. It binds the configured organization, bot credential and chat destination; a notice cannot approve or sign a payment. Standing outcomes can enqueue notices when notification delivery is enabled. Do not assume email or chat delivery merely because a case or held outcome exists. Configure and verify delivery without exposing private invoices or credentials to an inappropriate channel.

## Before enabling delegation

Configure dedicated persistence, a persistent worker and a compatible Circle agent wallet. Review the exact deployment manifest, canonical contracts and route; maintain a verifier independent of the executor. Safe owners must explicitly install the constrained authority, set limits, and practice pause/revocation. Covered payments additionally need a fully funded bound allocation and accepted protection terms.

The current public release has software for these paths, with financial activation still gated. See [release status](/docs/release-status), [integration contracts](/docs/integrations), [deployment](/docs/deployment) and [recovery](/docs/recovery).
