# Activate a real workspace

Countersign separates software configuration, readback evidence and owner authorization. A deployed landing page or a successful local test does not establish a working payment service. Start in Observe, test Prepare with consented fixtures, and review independent recovery before Delegate.

## Follow setup in the console

The authenticated workspace owner can open **Setup** in the console. It shows original-record steps, redacted infrastructure status, optional integrations and the separate payment-delegation requirements. Record presence does not establish approval or customer acceptance.

The default status is a local configuration inspection. **Check database schema** performs only database readbacks on a dedicated read-only connection; it does not contact model, notice or payment providers. The owner API is `GET /api/organizations/{organizationId}/activation?probe=database`. Other probe kinds are rejected. It checks the exact migration registry, expected tables and added security columns. Restore, tenant isolation and recoverable document custody still require their own exercises.

Public `/api/health` reports structural workspace configuration; `/api/ready` additionally requires the shipped database schema. A responding but unmigrated database returns readiness 503. Before private infrastructure is configured, the console links to these owner instructions and the separate synthetic demo.

## Inspect setup without performing an operation

Run from the application root with Node 22. The diagnostic emits authored check descriptions and status values; it omits secret values, private URLs, raw provider responses and exception messages.

```sh
# No credentials are needed to see the missing setup steps.
npm run doctor
npm run doctor -- --json

# Read private local configuration without making remote requests.
node --env-file=.env.local --import tsx scripts/doctor.ts

# Explicit read-only database, deployment and optional provider readbacks.
node --env-file=.env.local --import tsx scripts/activation-check.ts --probe --json

# Inspect each host separately rather than sharing one environment file.
node --env-file=/secure/countersign-worker.env --import tsx scripts/doctor.ts --profile=worker
node --env-file=/secure/countersign-verifier.env --import tsx scripts/doctor.ts --profile=verifier
```

`doctor` exits successfully after an informational report. `activation:check` and `doctor --strict` return a failure exit code when the selected technical configuration checks fail. The default scope is `workspace`; `--scope=execution` also requires execution configuration, and with `--probe` current deployment and database readbacks. An enabled switch alone never satisfies this check. A successful technical check is still not monetary authorization.

| Status | Meaning |
| --- | --- |
| missing | A required value or evidence bundle is absent. |
| invalid | Local structure, custody, identity binding or validity-window check fails. |
| disabled | An optional integration or the executor remains switched off. |
| configured | Local setup is present; the provider or operation is unverified. |
| verified | The named read-only readback succeeded, within the check's stated limits. |
| failed | An explicit readback could not establish the named fact. |
| owner_action | A human prerequisite remains outside this diagnostic. |

The JSON report exposes `workspaceConfigured`, `executionConfigured`, `databaseVerified`, `deploymentVerified` and `financialActivationVerified`. The last value remains false because the tool cannot attest owner funding authorization, consent, independent review, provider terms or protection capital. Check descriptions identify the narrower fact established by a readback.

`--probe` makes no model generation requests, signs no permit, creates no account, submits no transaction and sends no message. Database probes use a dedicated connection and a read-only transaction. Provider probes are GET requests with redirects refused and bounded responses: selected OpenAI model access or the selected model in DeepSeek's read-only model list, configured GitHub repository access and Telegram bot identity. JSON-RPC deployment readbacks inspect the manifest chain, module bytecode and finalized compatibility/revocation receipts. Telegram destination membership and delivery, model extraction capability and PR acceptance are not inferred from access checks.

## Reproducible local development

The marketing pages and synthetic demo run without a database. To exercise the real authenticated workspace against a disposable local database:

```sh
npm ci --ignore-scripts
docker compose -f docker-compose.local.yml up -d --wait
cp config/local.env.example .env.local
# Add a fresh document key and worker secret privately before continuing.
node --env-file=.env.local --import tsx scripts/migrate.ts
node --env-file=.env.local --import tsx scripts/activation-check.ts --probe
npm run dev
```

Generate the document key with `openssl rand -base64 32`; generate a separate worker secret with `openssl rand -hex 32`. These commands print secrets: run them privately and store the output in the ignored environment file or secret manager, never in a recording, screenshot, issue or chat. The Compose password is a documented local fixture, the database port binds to loopback, and the volume persists local data. Use no real invoices or wallets in this fixture. The worker and payment executor are not started by the local Compose file. Removing the volume destroys that fixture's data; ordinary `docker compose stop` preserves it.

The migration probe discovers the exact SQL migration filenames in the checkout, including administrative access metadata. It compares the deployed registry against that revision and checks expected tables and columns added by security migrations. Missing or unknown versions fail readiness. This comparison does not prove historical SQL contents, least privilege or isolation: perform the authenticated tenant tests and restore rehearsal as separate acceptance steps.

## Deployment and custody templates

The `config/` directory contains empty worker/verifier/restore environment templates and intentionally incomplete deployment/relay JSON templates. Empty evidence fields are invalid by design; fill them with actual reviewed deployment facts. Do not substitute example hashes or copy a test manifest into production.

| Host | Required custody |
| --- | --- |
| Web workspace | Dedicated database connection, canonical APP_ORIGIN and document encryption key; optional model/repository credentials. |
| Current authorization service | The isolated verifier key and current manifest. The existing authorization endpoint runs in the web service, so a production separation review must decide whether to isolate that service. |
| Persistent worker | Database access, read-only source RPC, reviewed manifest and the privately provisioned Circle agent profile. The verifier key must be absent. |
| Independent operations worker | Database access and one OPERATIONS_ORGANIZATION_ID; optional explicitly authorized notice configuration. No manifest, Circle profile, verifier or document key is required. |
| Destination relay | Separately reviewed route, code identities, destination wallet/profile and finality evidence. It cannot reuse the verifier identity. |
| Restore rehearsal | An isolated database connection with EXECUTION_ENABLED=false and no executor profile, executor wallet or verifier key. |

The manifest must bind the organization, source chain, Safe, module, token, Circle executor and verifier. The local inspector checks configured identity conflicts, validity windows, verifier-key binding and executor/verifier separation. Chain readbacks validate module bytecode and successful finalized transaction receipts; a receipt's success alone does not prove compatibility or revocation semantics. Read the recorded evidence and independently practice owner recovery.

## Independent operations reminders

Observe-stage teams can run due-date and exception digests without enabling delegated payments or provisioning a financial worker. Copy `config/operations-worker.env.example` to a private environment file. Database access and OPERATIONS_ORGANIZATION_ID are sufficient to inspect its configuration; enabled delivery additionally requires the explicit Telegram destination, canonical HTTPS origin, global notification switch and workspace preference opt-in.

```sh
# Local configuration validation only; no database, network, queue or message operation.
node --env-file=/secure/countersign-operations.env --import tsx scripts/operations-worker.ts
# Read-only workspace preview; output contains counts and delivery gates.
node --env-file=/secure/countersign-operations.env --import tsx scripts/operations-worker.ts --preview
# Start persisted reminders only after explicit notification authorization and opt-in.
node --env-file=/secure/countersign-operations.env --import tsx scripts/operations-worker.ts --run
```

This worker leases only `operations.notify` jobs for its configured organization. Payment jobs and another organization's reminders remain untouched. A workspace can set timezone-aware quiet hours; deferred notices retain the same job identity and do not consume a retry. A provider timeout or crash after a send reservation becomes uncertain and is never automatically sent again. Inspect the private `notification_deliveries` record and resolve the provider outcome before any manual replacement. There is no claim that a quiet/no-actionable run delivered a message.

`Dockerfile.operations-worker` supplies a separate non-root persistent container with a bundled JavaScript entrypoint and only dedicated locked production dependencies. It excludes Circle CLI, web/framework packages and compiler/lint/test tooling. It starts the reminder loop explicitly; notification configuration and workspace opt-in remain required. The independent container workflow checks actual final images without external networking or live credentials; inspect its result for the exact release commit before claiming a build. Build and deploy separately from Vercel, with only its private operations environment. Do not copy the financial worker's secret file onto this host. See [deployment and container verification](deployment.md) for build, validation and isolated smoke commands.

## Owner action checklist

1. Choose and provision a dedicated PostgreSQL organization/database, review cost, TLS, server role and retention. Set database/origin/document secrets privately, apply this revision's migrations, then verify wallet login, tenant separation, attachment encryption, restart persistence and an isolated restore. Do not reuse an unrelated connected database.
2. Select actual compatible source/destination chains and canonical token/contracts/decimals. Provision Circle agent profiles and accept provider terms through the account owner. Record genuine compatibility, renewal and revocation evidence; do not substitute an operator EOA while calling it Circle execution.
3. Commission deployment-specific application/contract/security review, deploy the exact reviewed controls and complete independent Safe-owner recovery. Populate current deployment and optional relay manifests using actual hashes, addresses, reports and finalized transactions. Keep executor and verifier custody separate.
4. Select a durable worker host and secret manager. Start with execution disabled; verify leased-job restart/recovery, original operation identities, unknown-broadcast reconciliation, source verification and independently finalized destination settlement. Test the separately authenticated authorization service. A Vercel web function is not the persistent worker.
5. Decide whether to enable model assistance (see [provider configuration](/docs/deployment#optional-model-provider)), GitHub evidence, scoped forwarding and notices. Configure least-privilege credentials; review model data handling. Create a scoped intake key through the workspace and test stable-ID forwarding with a consented fixture. Explicitly authorize a notification destination before enabling notices. No diagnostic sends a notice.
6. Explicitly authorize any funding and transfer allocation. Protection additionally needs accepted limited terms, fully reserved capital for all open liability windows, independent reviewer/recovery ownership and resources to service claims. Reconciliation and backup correctness do not supply these approvals.
7. Obtain actual pilot consent, customer acceptance and source records; use the portable pilot kit to collect agreed evaluation and bookkeeping evidence. Verify hosted CI for the release commit. The previous runner-start billing restriction was resolved in the observed October 6 run; the financial provider audit has a separate unresolved dependency gate documented in security-review.md. Keep source private until a separate publication/license decision; event registration, submission, outreach and spend require their own authorization.

## Backup and restore acceptance

Use the database provider's backup/PITR service and store the document key independently. Preserve the database revision, backup identifier and pending payment identity evidence privately. Stop workers and authorization while making a controlled baseline. Fingerprints are bounded to 100,000 rows per selected table; use provider tooling for larger operational datasets.

```sh
# Both private environment files must explicitly disable execution and omit executor/verifier identities.
node --env-file=/secure/source-readonly.env --import tsx scripts/restore-check.ts --snapshot=/secure/baseline.json
# Restore using the provider into an isolated database, then compare using its connection.
node --env-file=/secure/restored.env --import tsx scripts/restore-check.ts --compare=/secure/baseline.json
```

The snapshot contains counts and SHA-256 commitments for durable payment identities, original provider/transaction references, outbox identities, destination relays, notification delivery reservations, encrypted document bytes, ledger and versioned records. It emits no rows, tokens, invoice narrative, ciphertext or secret values. Snapshot files use mode 0600 and are never overwritten. A mismatch exits with failure and identifies tables only.

An identical snapshot proves the selected restored rows/identities match the baseline; it does not prove the backup is complete, the document key is recoverable, ledger reconciliation is correct or all schema/security policies survived. Run `activation-check --probe` against the isolated database, recover the document key privately, decrypt a consented fixture through the authenticated workflow, test tenant isolation, revoke stale sessions as required and independently reconcile uncertain transfers with the same operation IDs before any worker resumes.
