# Recovery without losing the payment identity

An uncertain operation remains the same operation. Preserve the payment ID, signed permit, nonce, provider idempotency key and transaction references before doing anything else.

## Timeout after submission

- Pause new submissions for the affected obligation.
- Look up the existing provider operation and transaction receipt.
- Check the module's consumed payment ID and emitted events on the correct chain.
- If the outcome remains unknown, retain capacity and escalate. Do not authorize a new payment ID.
- If source is confirmed cross-chain, reconcile the exact destination receipt before marking paid.

## Stale or contradictory provider data

The verifier holds automation when payment history is stale or an external transfer is unmatched. Record the last good synchronization, compare chain IDs and receipt finality, and reconcile discrepancies before reopening execution. A failed provider is not evidence that a payment failed.

## Independent owner recovery

Use the Safe's own interface or a separately verified transaction builder. Owners can pause/revoke module policy and disable the module without changing their existing signing threshold. Verify the Safe, module address and installed version against the deployment manifest. Never give an agent an unrestricted owner key to simplify recovery.

Disabling a module prevents new source executions; it does not reverse prior transfers or completed burns. Pending cross-chain settlement still needs reconciliation. Coverage allocations remain committed until expiry/cancellation conditions or terminal outcomes are proven.

## Database restore

Stop workers and submission first. Restore the durable database and encryption key from separately protected backups. Reconcile every submitted/uncertain operation against provider and chain history before enabling execution. Preserve idempotency keys and used nonces. Run the full test suite and a non-spending readiness probe.

## Recovery lab

The [interactive lab](/workspace/recovery) uses labeled synthetic scenarios for stale acceptance, changed destination, duplicate submission and uncertain settlement. Passing a simulation does not establish the health of a live deployment.

## Choose the next step from the evidence

| Situation | Immediate action | Evidence needed before resuming |
|---|---|---|
| No durable submission yet, but terms changed | Stop using the invalidated prepared authority | Current reviewed records and a reconciled operation |
| Provider timed out after submission | Preserve the original payment and provider key | Original provider lookup plus exact chain effects |
| Source burn confirmed, no destination receipt | Keep destination pending | Bound CCTP message and matching finalized destination mint |
| Manual outgoing transfer is unexplained | Hold new automation | Owner-backed classification and supporting records |
| Verifier or executor is compromised | Use independent Safe controls | Paused/revoked authority, reviewed rotation and fresh configuration |
| Database was restored | Stop workers and reconcile externally | Original identities checked against provider and chain history |

## Record an incident without exposing secrets

Keep a private timeline with organization and payment IDs, invoice/terms/policy versions, original provider identity, source and destination references, last known state, observed error and the accountable operator. Preserve logs needed for investigation. Do not put secret keys, Circle profiles, raw credential-bearing provider errors or private customer documents into a public issue.

## Attach a destination candidate

An authorized owner, approver or operator can attach a transaction hash and a note of at least ten characters to an existing payment. This helps find a transaction submitted outside the normal relay path. It neither broadcasts a transaction nor marks the invoice paid. The next worker pass independently verifies the candidate against the original source, route, recipient, amount and finality. See [relay](/docs/relay).

## Verify recovery before restoring automation

Confirm that new source execution is bounded by the intended current policy and module state. Independently reconcile every uncertain original operation, retain liabilities that cannot yet be released, and check that the database reflects the verified effects once. Review restored documents and tenant access with non-spending probes. Resume only the scope supported by that evidence.

An owner clear-hold action cannot resolve an unknown submitted transfer or widen future policy. Likewise, changing database state does not undo an on-chain permit. See [operations](/docs/operations) and [contracts](/docs/contracts) for the deployment-specific owner runbook.
