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
- Setup diagnostics: `npm run doctor -- --json` performs local checks; the explicit read-only probe flag adds database/manifest/provider readbacks. Inspect each host with `--profile=web`, `--profile=worker` or `--profile=verifier`; never treat configured secrets, access lookups or release switches as proof of monetary activation. See the [activation checklist](activation.md).
- Observe-stage digests: the independent operations worker needs no financial manifest or signing key. Explicit global configuration and workspace opt-in gate delivery; quiet-hour deferral preserves the original job identity. Unknown sends are durably recorded and are not automatically repeated. Its `--preview` mode reads without sending, and its default mode validates local configuration only.

## Incident procedure

1. Stop new authorization and pause the relevant Safe module policy if authority is at risk.
2. Preserve durable intents, keys, request IDs and source/destination transaction hashes.
3. Reconcile uncertain payments before replacement or cancellation.
4. Keep funded coverage reserved for every active window and pending claim.
5. Document customer impact and the verified resolution; update monitoring based on the failure.

A replay or restored database must never trigger fresh transfers with new identities. The independent owner procedure is in recovery.md. Internal review and simulations do not replace deployment-specific recovery practice.

For an uncertain operations notice, inspect the recorded provider outcome and preserve the same event identity. A timeout is not evidence that no message was delivered. Do not blindly requeue it with a new event ID. Keep `notification_deliveries` alongside outbox state through backup and restore to preserve this delivery boundary.

## Retention and backup

Agree invoice/evidence retention with each customer before accepting live data. Back up the database with point-in-time recovery appropriate to payment operations and protect the document encryption key separately. Test a restore and reconciliation with non-spending fixtures. The read-only `db:restore:verify` command fingerprints critical durable identities and encrypted bytes into a private mode-0600 baseline; compare against an isolated restored database while all workers remain stopped. This does not replace provider backup/PITR verification, document-key recovery, tenant isolation tests or independent settlement reconciliation. Revoke sessions, intake keys and vendor links when access ends; retaining financial records for required periods does not justify keeping unnecessary documents forever.
