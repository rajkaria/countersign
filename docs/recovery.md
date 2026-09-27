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
