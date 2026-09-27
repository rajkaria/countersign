# Integration contracts and release gates

Countersign integrates through constrained adapters. Code availability is distinct from a configured, tested live deployment. The web application can provide observation and human preparation without execution credentials. Financial execution remains disabled until the deployment manifest, provider session, independent review, and explicit operator activation exist.

## Circle Agent Wallets

The executor uses the official `@circle-fin/cli` command surface. Implementation was checked against package version **1.1.4**, including `wallet execute`, `wallet list`, and `transaction list`.

- Uses `execFile` with argument arrays, bounded output and a 45-second timeout; no shell interpolation.
- Discovers the exact configured **agent** wallet on the exact chain before execution. A local wallet is rejected; it is never presented as Circle-backed execution.
- Exposes only Countersign's fixed `execute((...),bytes)` ABI. Models cannot supply targets, arbitrary calldata, spender approvals, or command arguments.
- Binds all 23 contract permit fields, including Safe/module/chain, policy epoch, engagement/version, obligation/allocation/payment, destination and recipient, token, amount and fee, route and evidence, expiry, nonce, coverage, and CCTP domain/finality.
- Uses the existing payment UUID as Circle's `--idempotency-key`. A timeout is uncertain, not proof of failure. Provider transaction lookup is bounded and never manufactures a new operation.
- `estimate()` performs no broadcast, but a successful estimate alone does not prove authorization renewal, policy semantics, or revocation.

Install the reviewed CLI on a **persistent worker host**, provision its agent wallet session through Circle's user-controlled flow, and record proof. Never paste secrets into chat. The software does not create wallets, accept third-party terms, fund gas, or perform a real payment merely because it is deployed.

A Vercel web deployment does not provide a persistent Circle profile or worker by itself. Run `npm run worker` on the configured host, or `npm run worker -- --once` in a supervised scheduler. Worker logs include job IDs and outcomes, not credentials or raw provider stderr.

Reference: [Circle Agent Stack](https://developers.circle.com/agent-stack), [official CLI package](https://www.npmjs.com/package/@circle-fin/cli).

## Deployment evidence manifest

`EXECUTION_MANIFEST_PATH` points to a private JSON file matching `deploymentManifestSchema` in `src/lib/integrations/manifest.ts`. It records organization, chain/Safe/module/token/decimals, module bytecode hash, agent wallet and chain, independent verifier, verification/expiry, CLI version, compatibility transaction, revocation transaction, renewal evidence hash, and security review identity/report hash/date.

`loadDeploymentManifest()` returns `null` when unconfigured, rejects malformed or expired evidence, and does not infer readiness from boolean environment flags. `verifyDeploymentManifest()` checks the current RPC chain, bytecode hash, and successful finalized evidence transactions. Transaction success alone does not prove every semantic claim: the designated reviewer must examine compatibility, revocation, and renewal artifacts. This is a release evidence bundle, not a self-issued security audit.

Current on-chain preflight additionally checks module pause, policy epoch, executor, Safe and token bindings, and module installation. Readiness must be revoked when configuration or review evidence changes.

## Authorization and reserved coverage

`authorizePreparedPayment(db, actor, paymentId)` accepts an existing payment ID, never caller-supplied money fields. Call inside a database transaction with an authenticated owner. It revalidates current approved business records, excludes only the existing intent from duplicate allocation totals, verifies the reviewed deployment and on-chain engagement/obligation bounds, constructs the complete permit, and simulates the exact signed module call before queuing execution.

The verifier key is separate from Circle's execution wallet. The current signer reads `VERIFIER_PRIVATE_KEY` from the private host environment and requires its address to match the reviewed manifest. Production operations must secure and rotate this secret; replacing it with a KMS signer is an operational hardening choice before broader deployment. The app/model cannot administer policies or widen on-chain authority.

Covered authorization is two-phase. The first call persists an **unsigned** exact permit and returns the required reserve allocation parameters. The reserve allocator independently reserves that digest with approved terms and the full cap. A later call verifies the active on-chain allocation and signs the same permit. No database checkbox counts as funded collateral. Expired or changed unsigned permits are not silently replaced: reconcile their expiry, allocation, and operation identity first.

Execution activation requires `EXECUTION_ENABLED=true` plus the manifest and live preflight. Missing credentials or failed gates leave the product in Observe/Prepare. No mainnet funding or authority installation is automatic.

## Durable worker and recovery

The Postgres outbox leases work with `FOR UPDATE SKIP LOCKED`, a random fencing token, a 90-second lease, bounded exponential backoff, and eight automatic attempts. Expired workers cannot complete another worker's lease. Jobs retain stable IDs; exhausted attempts remain visible with an error for operator attention.

Before submission the worker checks fresh verification and deployment state, rejects invalidated authorization, and durably records `submitted`. If it crashes before the provider transaction ID is saved, the operation becomes `recovery_required`; no blind replacement is sent. Reconcile the original Circle request ID/payment UUID and chain effects manually. Provider failure also requires independent nonexecution proof before releasing allocations.

Source finality requires a successful finalized transaction containing the exact Countersign `PaymentExecuted` event and permit digest. A successful unrelated transaction is not sufficient. The worker preserves cross-chain obligations in `destination_pending` until matching destination proof.

One SQL statement inserts the idempotent settlement ledger event, updates the payment, preserves the previous invoice version, and updates paid/partial status and cumulative paid amount. Repeated callbacks cannot add settlement volume or ledger rows twice. The current automated route uses zero settlement fees; nonzero fees require separately approved net-payable accounting and remain gated.

## Safe read-only observation

`readSafe()` checks RPC chain, finalized contract code, owner list/threshold, nonce, token balance/decimals, and optional module installation. Incoming/outgoing token observations are bounded to at most 10,000 blocks. It explicitly returns `historyComplete: false`. Reconcile prior statements and outstanding transfers before enabling automation. A Safe-like ABI alone is not verified implementation bytecode; deployment review must establish canonical contract identity.

RPC endpoints are operator configuration, not vendor/model-controlled URLs. Provider failures or unsupported finality tags fail closed.

## GitHub evidence

`githubPullRequest()` accepts a validated owner/repository/PR number and uses only GitHub's fixed API origin. Redirects are forbidden; timeout and response-size limits apply. A token is optional for public repositories and private for authorized private repositories. Results bind the exact requested PR, source URL, actor, timestamps, and content hash.

A merged PR is always returned as **activity**, not acceptance. An authenticated customer acceptor must independently approve the relevant obligation. Repository comments, titles, filenames, and bodies are untrusted data and cannot authorize spend or modify a vendor register.

## Agent proposal adapter

The optional OpenAI adapter receives only already authorized evidence IDs and bounded content. Structured schema validation rejects invented source IDs and actions outside the deterministic verifier's available action set. It uses no tools, stores no provider response by request (`store: false`), and returns model/provider/prompt-version metadata. A proposal may explain, defer, or ask; it cannot override a verifier hold or change money fields. Model failure leaves deterministic checks available.

Configure a supported model and credential through the private service environment. Model inference costs require the operator's explicit configuration. Do not claim measured benefit over rules-only behavior before a genuine held-out evaluation.

## CCTP destination reconciliation

The standard CCTP V2 route supports a fixed-length message without hooks and a finality threshold of 2,000. It checks source/destination domains and messenger bindings; burn token, recipient, sender adapter, exact amount, fee bounds, nonce, and body version. Circle Iris attestation retrieval is bound to the **confirmed source transaction**. A matching amount from a different burn cannot settle this payment.

Destination verification requires a successful finalized receipt, matching MessageTransmitter `MessageReceived` nonce/body/source, and a native destination-USDC mint of the exact approved amount. Source burn and Circle attestation alone do not constitute vendor receipt. The current workflow requires the configured relayer or authorized operator to deliver the attested message and provide the destination transaction; no general-purpose wallet call is exposed to the planner.

The standard implementation requires `feeExecuted=0` and authorizes `maxFee=0`, so invoice net equals permit amount. A route requiring a deducted fee fails closed. Introduce explicit gross/net/fee authorization and ledger postings before enabling that route.

Network IDs, RPCs, token/messenger/transmitter addresses, source adapter, supported route, gas, and attestation availability must be verified against current Circle deployment documentation. No hardcoded network address is represented as a live deployment.

Sources: [Circle MessageV2 format](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/messages/v2/MessageV2.sol), [BurnMessageV2 format](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/messages/v2/BurnMessageV2.sol), [MessageTransmitterV2 events](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/MessageTransmitterV2.sol).

## Configuration inventory

| Setting                                                  | Purpose                                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                                           | Private durable Postgres database                   |
| `EXECUTION_MANIFEST_PATH`                                | Reviewed deployment and compatibility evidence file |
| `EXECUTION_ENABLED`                                      | Explicit operational activation, default off        |
| `SOURCE_RPC_URL` or `ARC_RPC_URL`                        | Source chain finalized observation and preflight    |
| `VERIFIER_PRIVATE_KEY`                                   | Isolated permit signer, matching reviewed verifier  |
| `CIRCLE_CLI_PATH`                                        | Reviewed Circle CLI executable on persistent host   |
| `DESTINATION_RPC_URL`                                    | Customer-required destination finality              |
| `CCTP_SOURCE_DOMAIN`, `CCTP_DESTINATION_DOMAIN`          | Reviewed CCTP domains                               |
| `CCTP_SOURCE_MESSENGER`, `CCTP_DESTINATION_MESSENGER`    | Reviewed route bindings                             |
| `CCTP_SOURCE_ADAPTER`                                    | Restricted module-bound burn adapter                |
| `CCTP_DESTINATION_TRANSMITTER`, `CCTP_DESTINATION_TOKEN` | Destination event/native-USDC contracts             |

Never commit the manifest's private operational artifacts, credentials, wallet profile, or tenant evidence. Run `npm test -- --run tests/integrations` for deterministic adapter and durable-lease tests; live compatibility/real settlement still require explicit credentials, deployment, allocated funds, and recorded proof.
