# Restricted CCTP destination relay

The destination relay completes the software path from an independently confirmed source burn to a verified destination receipt. It does not establish that any particular live route, Circle wallet or funded deployment works. No relay is enabled by default and no transaction is submitted by the test suite.

## Bound execution

`runDestinationRelay(db, payment, permit, config)` accepts an existing durable payment intent and its complete approved module permit. It verifies organization, source transaction, source Safe/module/token, amount, route, destination chain and domain against stored identity and server-controlled configuration. Its only provider write is:

```text
circle wallet execute "receiveMessage(bytes,bytes)" <exact message> <exact attestation>
  --contract <configured destination MessageTransmitterV2>
  --address <configured destination Circle agent wallet>
  --chain <configured destination Circle chain>
  --amount 0
  --idempotency-key <stable relay UUID>
  --output json
```

Arguments are passed directly through `execFile`, never a shell. There is no model-facing endpoint accepting a function signature, arbitrary destination contract or calldata. The destination Circle profile directory is explicitly supplied as `circle.cliHome` through `CIRCLE_CLI_HOME`. The child process receives only the small CLI environment allowlist; verifier private keys and unrelated application credentials are not copied into it. There is no EOA fallback, automatic login, terms acceptance, wallet funding or spending-policy change.

The relay supports the existing standard-finality CCTP V2 route, permissionless destination caller, fixed-length messages without hooks, and **zero maximum and executed fees**. It refuses fee-bearing messages, restricted destination callers, nonzero message expiration blocks and altered recipients/domains/amounts. Fee-bearing settlement needs separately reviewed net-amount accounting and is not silently treated as full invoice settlement.

The adapter follows Circle's [MessageTransmitterV2 `receiveMessage` interface](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/MessageTransmitterV2.sol) and [official CLI surface](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-circle-cli/SKILL.md). Before activation, verify the installed CLI's actual supported arguments and the selected destination agent-wallet behavior; documented interfaces and mocked tests do not prove that compatibility.

## Verification before submission

1. Independently verify the exact source module event and finality using `verifySourceSettlement`. A provider status or stored source transaction string alone is insufficient.
2. Fetch the attestation through the existing fixed-host Iris V2 helper using source domain and source transaction. Production uses `iris-api.circle.com`; testnet uses `iris-api-sandbox.circle.com`. HTTP responses are bounded and redirects are refused.
3. Require exactly one complete message matching the approved permit and configured source adapter/messengers. Store its exact bytes, attestation and message hash. Pending attestations produce a pending result with no transaction submission.
4. Verify destination chain ID and pinned MessageTransmitter/TokenMessenger code hashes. Check the recorded compatibility transaction is finalized and successfully called `receiveMessage` at the fixed transmitter from the configured destination agent wallet. These checks establish observable facts; an independent reviewer must still assess the deployment and test's meaning.
5. Check the message nonce has not already been used. If it was received elsewhere, obtain that existing transaction for reconciliation rather than broadcasting a replacement.
6. Simulate the exact destination call against the real contract. This checks attestation signatures and current contract behavior without submitting a transaction.
7. Confirm the configured address is a Circle agent wallet on the configured destination chain. Atomically claim the sole allowed submission attempt in durable storage, then invoke the exact CLI command.

A source permit may expire after its successful burn. That does not cancel an already-created bridge message; relay/reconciliation continue against the independently proven source execution. Disabling new relay submissions likewise does not stop reconciliation of an existing submitted destination transaction.

## Durable identity and uncertain outcomes

Migration `003_relay.sql` adds `destination_relays` with one row per payment, a tenant-bound foreign key, exact permit/configuration/message commitments and a maximum of one automatic submission attempt. The relay operation ID is deterministic UUIDv5 derived from organization, original payment ID and destination chain. It is distinct from the source payment's provider key.

State proceeds from `attestation_pending` to `prepared`, then `submitting`, `submitted` and `settled`. Timeout or malformed provider response after the submission boundary records `uncertain`. Provider-reported failure is `recovery_required`, not proof that the destination effect did not occur. Concurrent workers use a compare-and-set transition from `prepared` with attempts zero; only one wins. A second run observing `submitting`, `uncertain` or another post-attempt state cannot submit again.

**The hook requires an autocommit database pool/connection. Do not call it inside a transaction that remains uncommitted across the provider call.** The `submitting` row must survive a process crash before the network mutation occurs. Database failure after a provider call leaves the prior durable `submitting` record, which blocks blind retry. Application workers use the existing intent and relay UUID throughout recovery.

Provider transaction lookup is bounded to the configured destination wallet/chain and ten pages. A missing provider ID after an unknown timeout requires operator reconciliation. No automatic code path clears attempts, creates another relay identity or decides that a timeout means failure. Even an on-chain nonce's replay protection does not justify repeated gas-spending submissions.

## Attach an existing transaction

`attachDestinationRelayTransaction(db, actor, paymentId, transactionHash, note)` accepts evidence from an authenticated current owner, approver or operator in the payment's organization. It records who attached the candidate, the previous candidate and the reason. It does not submit anything, change a payment recipient, release capacity or mark an invoice paid. The caller should use an ordinary application transaction for this database-only action.

The next relay run independently checks the attached transaction with `verifyCctpDestination`: current destination chain, successful finalized receipt, canonical block hash, matching MessageReceived nonce/source/sender/body and exact native USDC mint to the approved recipient. Iris is consulted again to bind the message to the source transaction. Incorrect or nonfinal candidates remain unconfirmed; an operator may attach corrected evidence. Already settled relays cannot be overwritten.

After verification, the hook persists the destination transaction, exact CCTP message and relay ID and returns `{ finalized: true, transaction }`. The payment worker remains responsible for atomically settling the invoice/subledger. A submitted relay returns `finalized: false`, even when a provider transaction hash is available.

## Configuration and activation

`relayConfigFromEnv()` loads server-controlled `RELAY_CONFIG_JSON` or `RELAY_CONFIG_PATH`. Absence returns `null`; malformed configurations fail closed. Never accept this configuration from a browser, uploaded invoice or model output.

| Configuration | Required values |
|---|---|
| Payment identity | `organizationId`, `sourceChainId`, `destinationChainId`, `sourceModule`, `sourceSafe`, `sourceToken` |
| CCTP route | `sourceDomain`, `destinationDomain`, `sourceMessenger`, `destinationMessenger`, `sourceAdapter`, `destinationTransmitter`, `destinationToken`, `testnet` |
| Verified contracts | `destinationTransmitterCodeHash`, `destinationMessengerCodeHash` |
| Read-only providers | `sourceRpcUrl`, `destinationRpcUrl` |
| Circle destination wallet | `circle.binary`, `circle.wallet`, `circle.chain`, `circle.cliHome` |
| Review evidence | `review.reviewer`, `review.reportHash`, `review.compatibilityTransaction`, `review.verifiedAt`, `review.expiresAt` |
| Explicit activation | `enabled`, default false |

Execution-relevant identities are committed to the relay row. Changing the chain, wallet, recipient-side contracts or pinned code identity cannot silently retarget an existing operation. RPC endpoints, credential directory and renewed review metadata can change without replacing the financial identity. Changes to protocol code or routing after submission require a reviewed migration/recovery procedure.

Activation still requires verified canonical addresses/domain mappings/token decimals, sufficient destination gas, a provisioned compatible Circle agent wallet, current review evidence, deployment verification and explicit operational authorization. The example tests use fabricated addresses and mocked providers; never copy those addresses into a deployment.

## Tests and remaining boundaries

`tests/integrations/relay.test.ts` uses real PGlite persistence with mocked Iris, Circle and chain verification. It tests durable-before-submission ordering, deterministic separate identity, exact fixed call arguments, restart after unknown timeout, authenticated attachment plus independent verification, tenant/route/fee rejection, attestation waiting, changed-configuration rejection, disabled-submission reconciliation, source finality/review gating and concurrent submitters. Run:

```sh
npm test -- tests/integrations/relay.test.ts
```

Live destination compatibility, canonical deployments, funded gas and real source/destination settlement remain external release gates. Actual message delivery is subject to Circle attestation and chain/provider availability. No blanket completion-time promise or independent security-audit claim is made.
