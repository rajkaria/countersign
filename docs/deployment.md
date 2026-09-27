# Deploy and operate Countersign

The web application runs on Vercel. PostgreSQL is the durable source of truth; browser storage is used only for the explicitly isolated demo. A separate durable worker executes leased outbox jobs. The web application does not silently run background work after returning a response.

## Local setup

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

The landing page, handbook and synthetic demo run without credentials. For a real workspace, configure DATABASE_URL, APP_ORIGIN and DOCUMENT_ENCRYPTION_KEY. Generate a 32-byte encryption key with openssl rand -base64 32 and store it securely. Never send credentials through chat or commit them.

## Database migration

Use a new dedicated PostgreSQL database. Do not reuse unrelated production tables. Migrations require a database administrator; runtime access should use a narrowly scoped role and secure TLS.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
```

The migration runner serializes with an advisory lock, tracks versions and executes each migration in a transaction. All exposed user tables enable row-level security with no anonymous policies. The current runtime connects as a dedicated server-side database owner, which bypasses row-level security; application membership and tenant predicates are therefore mandatory and tested. Do not reuse a public client role or expose the owner connection. A future restricted runtime role requires matching tenant policies before use. Never grant these tables to public client roles.

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

Back up PostgreSQL and the document key separately. Test restore before accepting real customer records. Preserve pending payment identities across restore. Establish a retention policy with customers and revoke vendor links and intake keys when they are no longer needed.

## Persistent worker container

Dockerfile.worker provides a Node 22 worker with the inspected Circle CLI version pinned. It intentionally does not provision a wallet, accept provider terms, copy profiles, or embed environment files. Build the container separately from Vercel, provision secrets on the worker host, and mount its Circle profile under the non-root user's home. Mount a reviewed deployment manifest read-only or supply the JSON secret. Start with execution disabled and verify the exact deployment before enabling it.

```sh
docker build -f Dockerfile.worker -t countersign-worker .
# Supply a private environment file and a protected Circle profile/manifest mount.
# Run only after the documented compatibility and recovery checks are complete.
docker run --init --restart unless-stopped --env-file /secure/countersign-worker.env countersign-worker
```

The container definition is supplied for deployment; it has not been built or hosted as part of the static Vercel release. The worker performs a periodic read-only Safe refresh, standing obligation reassessment and leased job dispatch. A missing manifest or database is a startup gate. Do not put Circle credentials or the verifier key in the web deployment unless a documented web authorization operation requires the isolated verifier; prefer separate verifier custody for production.
