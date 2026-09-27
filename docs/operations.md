# Operational ownership

Before any real delegated execution, designate a primary operator and an independent recovery owner. Record escalation contacts privately, not in this repository. The web service, durable worker, verifier, Circle profile and Safe owners are separate operational components.

## Signals

- Web liveness: GET /api/health. This is not payment readiness.
- Database readiness: GET /api/ready; treat non-200 as degraded.
- Outbox: oldest incomplete job age, attempt count, expired leases and last_error.
- Payments: uncertain, recovery_required and destination_pending age; never silently discard.
- Evidence: last successful history sync, coverage bounds and unmatched transfers.
- Authority: current policy epoch, enabled module, executor/verifier identity and pause state.
- Protection: funded collateral, allocated liability, pending claims and reviewer deadlines.

## Incident procedure

1. Stop new authorization and pause the relevant Safe module policy if authority is at risk.
2. Preserve durable intents, keys, request IDs and source/destination transaction hashes.
3. Reconcile uncertain payments before replacement or cancellation.
4. Keep funded coverage reserved for every active window and pending claim.
5. Document customer impact and the verified resolution; update monitoring based on the failure.

A replay or restored database must never trigger fresh transfers with new identities. The independent owner procedure is in recovery.md. Internal review and simulations do not replace deployment-specific recovery practice.

## Retention and backup

Agree invoice/evidence retention with each customer before accepting live data. Back up the database with point-in-time recovery appropriate to payment operations and protect the document encryption key separately. Test a restore and reconciliation with non-spending fixtures. Revoke sessions, intake keys and vendor links when access ends; retaining financial records for required periods does not justify keeping unnecessary documents forever.
