# Deploy and operate Countersign

The web application runs on Vercel. PostgreSQL is the durable source of truth; browser storage is used only for the explicitly isolated demo. A separate durable worker executes leased outbox jobs. The web application does not silently run background work after returning a response.

## Local setup

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

The landing page, handbook and synthetic demo run without credentials. For a real workspace, configure DATABASE_URL, APP_ORIGIN and DOCUMENT_ENCRYPTION_KEY. Generate a 32-byte encryption key with openssl rand -base64 32 and store it securely. Never send credentials through chat or commit them. The [activation guide](activation.md) provides the complete owner checklist, a loopback-only PostgreSQL development launcher, separate host templates and read-only setup diagnostics.

```sh
npm run doctor
node --env-file=.env.local --import tsx scripts/activation-check.ts --probe --json
```

The default diagnostic reads local configuration only; remote readbacks require the explicit probe flag. Configured values and verified readbacks appear separately. Financial authorization, provider terms, consent, funded protection and independent review remain owner gates.

## Database migration

Use a new dedicated PostgreSQL database. Do not reuse unrelated production tables. Migrations require a database administrator; runtime access should use a narrowly scoped role and secure TLS.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
```

The migration runner serializes with an advisory lock, tracks versions and executes each migration in a transaction. The read-only activation probe discovers the exact migration list from this checkout and fails on missing or unknown deployed versions, missing tables and missing added security columns. All exposed user tables enable row-level security with no anonymous policies. The current runtime connects as a dedicated server-side database owner, which bypasses row-level security; application membership and tenant predicates are therefore mandatory and tested. Do not reuse a public client role or expose the owner connection. A future restricted runtime role requires matching tenant policies before use. Never grant these tables to public client roles.

## Verification

```sh
npm run verify
npx playwright install chromium
npm run test:e2e
npm audit
```

The verify gate runs TypeScript, lint, Vitest, Foundry and a production Next build. The database tests run real PostgreSQL semantics through PGlite, including constraints and tenant isolation. Contract tests use local mocks and fuzzing; that is not evidence of deployment or an audit.

## Deploy to Vercel

Connect the private GitHub repository or run vercel --prod from this application root. Set APP_ORIGIN to the canonical HTTPS deployment origin before enabling authentication. Add secrets through the Vercel environment UI or CLI, then redeploy. Never expose database, worker, document, model or Circle credentials in NEXT_PUBLIC variables.

Read /api/health for application availability and /api/ready for database readiness. A healthy static site is not proof that the payment executor is configured.

## Operations

Run the worker on a durable host with database access and separately protected Circle credentials. Keep the executor and verifier identities distinct. Alert on expired leases, stuck payment intents, stale history, due obligations, provider failure, insufficient gas and insufficient coverage. Review operational alerts without converting expected configuration gates into claimed successful executions.

Back up PostgreSQL and the document key separately. Test restore before accepting real customer records. Preserve pending payment identities across restore. The activation guide's read-only restore fingerprint command compares original payment/outbox/relay identities, versioned records, encrypted bytes and ledger commitments without outputting private rows; it supplements provider backup verification and authenticated/key-recovery tests. Establish a retention policy with customers and revoke vendor links and intake keys when they are no longer needed.

## Persistent worker container

`Dockerfile.worker` builds the existing financial worker into a Node 22 JavaScript entrypoint. The final image installs only the dedicated locked PostgreSQL, validation and chain-library runtime in `worker-runtime/`, plus the separate locked Circle CLI 1.1.4 runtime. The build-only compiler, TypeScript launcher, web framework, React, lint/test tools and development glob dependency chain are absent from the final image. Both build and runtime stages pin the same multi-architecture Node image digest.

It intentionally does not provision a wallet, accept provider terms, copy profiles, or embed environment files. Build separately from Vercel, provision secrets on the worker host, and mount its Circle profile under the non-root user's home. Mount a reviewed deployment manifest read-only or supply the JSON secret. Ensure mounted profile permissions permit the image's `node` user (UID 1000) to read and, if required by Circle session renewal, update its dedicated profile. Start with execution disabled and verify the exact deployment before enabling it.

```sh
docker build -f Dockerfile.worker -t countersign-worker .
# Supply a private environment file and a protected Circle profile/manifest mount.
# Run only after the documented compatibility and recovery checks are complete.
docker run --init --restart unless-stopped \
  --env-file /secure/countersign-worker.env \
  --mount type=bind,source=/secure/countersign-circle,target=/home/node/.circle \
  --mount type=bind,source=/secure/deployment.json,target=/run/countersign/deployment.json,readonly \
  countersign-worker
```

The worker performs a periodic read-only Safe refresh, standing obligation reassessment and leased job dispatch. A missing manifest or database is a startup gate. Keep the Circle profile on the worker and the verifier key absent there. The current payment authorization endpoint needs the verifier key in its service; production review must decide whether to isolate that authorization service from the broader web deployment. The `config/worker.env.example` and `config/verifier.env.example` templates encode this distinction. Run the diagnostic separately on each host using its matching profile.

The financial provider runtime has an unresolved dependency release gate: Circle CLI's current `node-forge` dependency has an unpatched high-severity RSA verification advisory; an `elliptic` dependency also retains a low-severity primitive-risk advisory. Exact findings and the scoped reachability review are in [security review](security-review.md). The CLI remains pinned and the dependency audit fails on moderate/high findings rather than suppressing them. Local parser/import checks and compatible transitive updates are not deployment-specific payment compatibility evidence. Keep financial execution disabled until a reviewed provider fix or reviewed alternative resolves this gate.

## Observe-stage operations worker

Use `scripts/operations-worker.ts` independently for due-date/exception digests while payment delegation remains disabled. It needs DATABASE_URL and OPERATIONS_ORGANIZATION_ID; no execution manifest, Circle profile, verifier key or document key is required. Its default mode validates configuration without database/network access. `--preview` is read-only, and `--run` explicitly starts the durable loop. Delivery requires both global notification configuration and authenticated workspace opt-in, respects quiet hours and preserves uncertain-send identities.

```sh
node --env-file=/secure/countersign-operations.env --import tsx scripts/operations-worker.ts --preview
# Run after the owner explicitly selects a destination and opts in.
node --env-file=/secure/countersign-operations.env --import tsx scripts/operations-worker.ts --run
```

`config/operations-worker.env.example` and `Dockerfile.operations-worker` provide isolated deployment inputs. Its final image includes only its bundled entrypoint and dedicated production runtime; no Circle CLI/profile, web framework, compiler, lint/test tooling, model extraction or financial dispatcher is included. It runs as `node`, defaults both payment and notice switches to false, and rejects financial credentials in its configuration. Shared record schemas retain inert ABI declarations; these are not an executor. The worker leases only its organization's operations notices and cannot dispatch financial jobs.

```sh
docker build -f Dockerfile.operations-worker -t countersign-operations-worker .
# Configuration validation only: this command cannot contact a database or provider.
docker run --rm --network none --env-file /secure/countersign-operations.env \
  countersign-operations-worker node operations-worker.mjs
# Default container command starts the persistent loop; delivery still requires authorization and opt-in.
docker run --init --restart unless-stopped --env-file /secure/countersign-operations.env \
  countersign-operations-worker
```

## Container verification and dependency gate

The independent `Worker containers` GitHub workflow builds both final images and tests their actual package inventory, non-root identity, offline startup and Circle command interfaces. Smoke containers use a read-only root filesystem, dropped capabilities and no external networking. A separate internal Docker network connects the operations image only to a disposable PostgreSQL fixture, where disabled `--run --once` startup must report no queued notices and no financial execution. No live credentials, model calls, notices or transactions are used. The test removes its temporary database and network even after failure; it does not host a service or provision an account.

The workflow's separate runtime-audit job remains a strict release gate and reports the unresolved Circle provider findings independently of build/smoke evidence. A successful build does not mean this gate or financial activation passed. Inspect the actual workflow result for the release commit before claiming container verification; Docker was unavailable on the development host.

To reproduce the packaging checks with Node 22 and Docker:

```sh
npm ci --prefix worker-runtime --ignore-scripts
npm test --prefix worker-runtime
docker build -f Dockerfile.worker -t countersign-worker:test .
docker build -f Dockerfile.operations-worker -t countersign-operations-worker:test .
docker pull postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826
node scripts/verify-worker-containers.mjs
npm audit --prefix worker-runtime --omit=dev --audit-level=moderate
npm audit --prefix worker-runtime/circle --omit=dev --omit=peer --audit-level=moderate
```

The separate CLI lock applies exact updates for `jayson` 5.0.0, `toml` 5.0.0 and WebSocket 8.x to 8.22.0, removing their reported fixable advisories. CLI imports/help and the fixed executor command contract are checked; real wallet, source/destination and recovery compatibility still require the owner-run deployment exercises. Compiler-only peers are omitted from the Circle runtime while explicit production dependencies remain installed.
