# Payment authority and reserved protection

These contracts implement a constrained payment boundary for an existing Safe, a dedicated CCTP V2 route, and a fully collateralized protection ledger. They are source code with local tests. No deployment, funded reserve, Circle wallet compatibility result, security audit, or live coverage is implied by this document.

## Authority model

| Actor | Allowed actions | Cannot do |
|---|---|---|
| Existing Safe owners, acting through the Safe threshold | Install/disable module; configure keys and limits; approve engagement versions and obligations; configure route; pause/revoke | Recover funds already settled to another address without recipient cooperation |
| Executor, intended to be a verified Circle wallet | Submit `execute` with independently signed exact permit | Configure policy, change recipient, mint its own valid verifier signature, arbitrary Safe call |
| Independent verifier | Sign exact payment permits; attest destination receipt using `confirmDestination` | Submit module payments as executor; administer Safe policy |
| Reserve allocator | Allocate available collateral to immutable permit digest and payment ID | Withdraw collateral or decide claims |
| Reserve administrator | Enable modules; withdraw only uncommitted collateral | Modify existing allocations or decide claims |
| Independent reserve reviewer | Resolve a filed claim with a documented gross loss, recoveries and determination commitment | Withdraw unallocated funds, pay an arbitrary recovery address, increase an allocation |
| Business Safe | File a claim; receive compensation at its own existing owner-controlled address | Change a reserve allocation or claim a different business's allocation |

Safe administration uses `msg.sender == safe`. An individual owner address is insufficient: normal owner-threshold Safe execution calls the module. Neither agent key is made a Safe owner. Normal human Safe transactions and `disableModule` remain available if the application, executor or verifier is down. The module is non-upgradeable. Reserve roles are immutable; use independently controlled multisig addresses with their own recovery procedures.

The reserve reviewer must differ from the administrator and allocator addresses. Address separation is enforceable; independence of the humans controlling those addresses requires governance and review. The application must not advertise independence based only on address inequality.

## Contracts and interfaces

- `contracts/src/CountersignModule.sol`: one immutable Safe, ERC20 token, and optional reserve.
- `contracts/src/RestrictedCctpAdapter.sol`: immutable module, token and Circle TokenMessenger V2 address; only the module can invoke a burn.
- `contracts/src/ReservedProtection.sol`: immutable token and role addresses; no proxy or unrestricted token withdrawal.
- `contracts/abi/*.json`: generated JSON ABIs for client integration. Re-export after source changes with `forge inspect <Contract> abi --json`.

The module uses Safe's `execTransactionFromModuleReturnData(address,uint256,bytes,uint8)`, only with operation `0` (CALL), value `0`, immutable token target, and `transfer(address,uint256)` selector. It checks both ERC20 return data and exact sender/recipient balance changes. It has no arbitrary-call, delegatecall, token approval, hook or administrator bypass entry point.

### Policy and approved records

`configure(executor, verifier, Policy)` sets per-payment, exact rolling-24-hour, lifetime allocation, token cash floor, expiry and fully-covered-only policy. Executor and verifier must be distinct, nonzero and different from the Safe. A configuration, pause, unpause, revocation, engagement update, obligation update or route update increases `policyEpoch`; all older permits become unusable.

`setEngagement(id, Engagement)` approves a strictly increasing version, exact recipient, destination chain, payment/rolling/lifetime limits and active status. `setObligation(id, engagementId, cap)` binds a persistent obligation to one engagement. It cannot reassign that obligation or lower its ceiling below consumed capacity. Owner-controlled version changes do not reset historical spending.

The lifetime allocation and rolling window include all module source debits, including pending bridge transfers. Each obligation stores capacity consumed; `obligationPaid` is a historical ABI name for this consumed allocation, **not proof of destination settlement or invoice accounting**. Reconciliation must use actual destination evidence.

Rolling limits use cumulative timestamped checkpoints and binary search. The measured interval is `(block.timestamp - 86400, block.timestamp]`; payments exactly 24 hours old leave the window. UTC midnight never resets the limit. Same-timestamp debits combine in one checkpoint. Lookup cost is logarithmic in historical timestamps, while storage grows with timestamps. Both global and engagement limits apply.

The cash floor protects only the immutable ERC20 balance immediately after the module's own debit. It cannot protect against independent owner transfers, other enabled Safe modules, off-chain obligations, native gas fees or future token administrative actions.

### Exact typed permit

EIP-712 domain: name `Countersign`, version `1`, current chain ID and the module's address as `verifyingContract`. `permitDigest` returns the complete EIP-712 digest. Do not personal-sign or add an Ethereum signed-message prefix. EOA signatures and EIP-1271 verifier contracts are supported through OpenZeppelin `SignatureChecker`.

The primary type and field order are:

```text
PaymentPermit(
  uint256 schemaVersion,
  uint256 chainId,
  address safe,
  address module,
  uint256 policyEpoch,
  bytes32 engagementId,
  uint64 engagementVersion,
  bytes32 obligationId,
  bytes32 allocationId,
  bytes32 paymentId,
  uint256 sourceChainId,
  uint256 destinationChainId,
  address recipient,
  address token,
  uint256 amount,
  uint256 maxFee,
  bytes32 route,
  bytes32 evidenceCommitment,
  uint64 expiresAt,
  uint256 nonce,
  bytes32 coverageId,
  uint32 destinationDomain,
  uint32 minFinalityThreshold
)
```

`schemaVersion` is `1`. IDs and nonce must remain stable across transport retries. All three of payment ID, installment allocation ID and nonce are individually single-use for the lifetime of a module, including across policy updates. Use domain-separated randomized IDs; do not publish predictable hashes of private documents. The evidence commitment binds bytes, not whether work was accepted or an invoice is truthful.

`amount` is the exact source token debit in the token's integer units. Token decimals are deployment configuration, not assumed by the contracts. `expiresAt` is Unix seconds and remains valid at the exact expiry second; it is invalid afterwards. Effective execution also requires policy expiry not passed.

`execute(permit, verifierSignature)` consumes limits and identifiers before external calls. A revert rolls back all consumption, reserve activation and transfers. On successful source execution, retrying the same operation cannot transfer again. The caller must reconcile an uncertain network submission before deciding whether the transaction succeeded.

## Routes

### Direct ERC20

`route = keccak256("DIRECT_ERC20_V1")`, destination chain equals current/source chain, maximum fee `0`, domain `0`, finality `0`. Only the approved recipient receives funds. Successful exact transfer is direct destination confirmation.

### Restricted CCTP V2 standard transfer

`route = keccak256("CCTP_V2_STANDARD_V1")`. Safe owners configure `setRoute(destinationChainId, adapter, destinationDomain, enabled)`. Module/token bindings of the adapter are checked, and the configuration changes the policy epoch. Deployment review must independently inspect the actual adapter bytecode and messenger address; getters alone do not attest safe code.

The adapter calls Circle's documented seven-argument `depositForBurn(amount, destinationDomain, mintRecipient, burnToken, destinationCaller, maxFee, minFinalityThreshold)`. The recipient is the approved EVM address left-padded to bytes32, the token is immutable, destination caller is zero (permissionless relay), finality is fixed at `2000`, and there is no hook. The module transfers the exact source debit into the adapter, which approves only that amount, burns it, resets approval to zero, and verifies exact token consumption. A failure atomically reverts the source transaction.

The implementation follows Circle's [TokenMessengerV2 source interface](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/TokenMessengerV2.sol). Supported network/domain combinations, canonical deployed addresses, finality behavior, minimum fees and Circle-wallet contract-call compatibility require live verification before configuring a route. Tests use a mock messenger; they do not establish production Arc/Base support.

**The bridge amount includes its fee.** CCTP deducts the actual fee from the burn amount. The authorized maximum must be less than amount; minimum recipient delivery is `amount - maxFee`. The ledger must reconcile the actual minted amount and fee. Never mark the invoice paid for the gross source debit. If a precise net principal is required, construct the source debit from an approved fee quote and reconcile the remaining obligation explicitly; owner-approved obligation capacity must include this source-debit convention.

A source burn emits `PaymentExecuted(..., destinationConfirmed=false)` and stores `pending[paymentId]`. Only the current independent verifier can call `confirmDestination(paymentId, nonzeroReceiptCommitment)`, once. This is a **trusted verifier attestation**, not an on-chain light client or automatic proof of a Circle message. The verifier must validate exact destination recipient, asset, delivered amount, domain, source identity and finality off-chain. Bridge capacity stays consumed after confirmation or a refund. Refunds do not automatically authorize a replacement payment.

## Protection lifecycle

Funding is an explicit ERC20 transfer to the reserve. Free capacity is `max(balance - committed, 0)`. No advertised liability should exist without an actual on-chain allocation and accepted terms/reviewer/funding.

1. The allocator calls `allocate(id, module, exactPermitDigest, paymentId, beneficiarySafe, cap, permitExpiry, termsHash)`. The cap must fit free capacity. IDs and payment IDs are never reused. Allocation contents cannot be changed or reduced.
2. The bound module calls `activate` in the payment transaction. The complete permit digest, payment ID and beneficiary must match. Fully-covered-only mode additionally requires `cap >= source debit`; policies allowing explicitly limited protection may use a smaller cap. A coverage ID never silently becomes an unprotected transfer if activation fails.
3. Direct transfers start a 14-day filing window immediately. Bridge source execution stays in `Executing` with collateral retained indefinitely until the verifier confirms destination settlement; the filing window starts at confirmation, conservatively extending protection if reporting is late.
4. Only the beneficiary Safe can file a nonempty evidence commitment. Claims can be filed while bridge execution is pending. A timely filed claim retains its full cap beyond the filing window.
5. The independent reviewer resolves a filed claim with gross loss, prior recoveries and a nonempty determination commitment. Payout is gross loss minus recovery, cannot exceed the cap, and goes only to the immutable beneficiary Safe. The allocation closes atomically and cannot pay twice. A rejection is a zero-loss final determination. A decision is final on-chain; terms must provide the evidence/appeal procedure **before** final resolution. The contract does not judge whether evidence is truthful or prevent a dishonest reviewer from making a bad decision.
6. Anyone can release an unexecuted reservation only **after** its permit expiry, or an unclaimed settled allocation only **after** its filing deadline. An executing or claimed allocation cannot be expired away. Administrators withdraw only free collateral. There is no emergency bypass that can impair active liabilities.

Payouts compensate separately; they do not reverse the vendor payment. Payment identity uniqueness prevents duplicate allocation for the same payment within a reserve. Reviewer procedures and application constraints must also detect duplicate loss claims across related invoices, payments, reserve deployments and outside recoveries. The contracts alone cannot discover those relationships.

## Installation and recovery runbook

Application deployment addresses come from a verified manifest specific to the chain and token. Arc native-USDC observations additionally select the official protocol token and system-event emitter for the identified Arc chain.

1. Verify the Safe implementation/module API, owner threshold and existing modules. Confirm the token is canonical, non-rebasing and has no transfer tax; record decimals. Confirm the exact chain, messenger bytecode, destination domain, fee policy and RPC finality assumptions.
2. Deploy the reserve with independently controlled role addresses and accepted terms, then deploy the module with the existing Safe/token/reserve. If protection is unavailable, deploy with reserve address zero and leave covered-only disabled; never advertise funded protection.
3. For a verified required cross-chain route, deploy the restricted adapter with the module/token/messenger. Have Safe owners register the route through an ordinary Safe transaction. Do not route through an unreviewed replacement contract.
4. The reserve administrator enables the module. The Safe owners approve engagements, obligations and an expiring small-allocation policy, then enable the module in the Safe. Verify every address and epoch from chain readback. Key provisioning must happen outside chat/logs.
5. Prove the Circle execution wallet can call the exact module with a separate valid verifier signature and rejects unauthorized behavior. Do not substitute an operator EOA while claiming Circle execution.
6. Test pause, revocation, Safe-level module disable, replay rejection, signer rotation, and recovery from a source transaction timeout before real allocations. Retain human Safe access independent of the application.
7. If the executor/provider/app is unavailable, use an ordinary owner-threshold Safe transaction to `pause()` or `revoke()`. For full module removal call Safe's `disableModule(previousModule,module)` using the correct current linked-list predecessor from Safe state. Never guess the predecessor. Owners can continue normal manual Safe operations.
8. If a verifier key is compromised, pause, rotate executor/verifier with `configure`, and re-approve exact pending work under a fresh epoch. `confirmDestination` is callable by the current verifier even while payment execution is paused; a replacement verifier can reconcile old bridge records. Revocation itself clears the verifier, so install a replacement through the Safe before attempting reconciliation.
9. If the reserve reviewer is unavailable, pending claims remain fully allocated. Use the reviewer's own multisig recovery procedure. There is deliberately no operator bypass or unilateral role replacement. Do not withdraw or dilute committed funds to free capacity.
10. After confirmed refund or aborted execution, reconcile the original operation, preserve its identity and liability records, and require fresh authorized terms for any new payable. On-chain used identifiers and lifetime spending are not reset.

## Arc compatibility and owner evidence

Arc supports an [ERC20 USDC interface](https://docs.arc.io/arc/references/contract-addresses) at `0x3600000000000000000000000000000000000000` with 6 decimals, sharing the native USDC balance with 18 decimals. Countersign's permits and principal ledger use the verified ERC20 integer units. Native observation preserves original precision and rounds conservatively; a fractional outgoing transfer requires independent reconciliation. The contracts still need real Arc deployment/composition review. A conventional local EVM cannot reproduce all [Arc runtime behavior](https://docs.arc.io/arc/references/evm-differences).

The source settlement verifier binds the exact module event, permit digest and recipient at a finalized canonical block. It does not assume the executor is the outer transaction sender. The automatic destination relay currently verifies a **direct outer** `receiveMessage` transaction from the configured Circle wallet to the transmitter. The inspected Circle CLI 1.1.4 creates EVM agent wallets as SCAs. A sponsored account-abstraction transaction may instead use a bundler and EntryPoint as the outer envelope. Consequently, this relay check does **not** establish SCA inner-call compatibility and may reject a successful SCA compatibility transaction. Keep automatic destination relay disabled until the exact supported Circle envelope, calldata, successful inner-call identity and finalized mint evidence are independently reviewed. Do not remove the identity check or replace the Circle signer simply to make a demo pass. The owner can reconcile an independently received destination transaction through the existing recovery workflow; a source burn remains pending until exact destination evidence is verified.

Before any real testnet business settlement, the owner supplies:

1. A dedicated workspace database, encrypted-document secrets/restore evidence, organization identity and consented agreement, invoice and acceptance. Preserve customer evidence separately from fixtures.
2. An owner-completed [Circle testnet login](https://developers.circle.com/agent-stack/agent-wallets/quickstart), accepted provider terms and private profile custody. Enter the OTP personally. Confirm the actual `ARC-TESTNET` agent wallet, CLI version, deployment/session status and sponsorship limits; [sessions expire after 28 days](https://developers.circle.com/agent-stack/agent-wallets/quickstart). Keep Circle executor and verifier credentials separate.
3. An independently recoverable Safe, actual owner-threshold administration, canonical token/decimals, reviewed module bytecode, isolated verifier address, small expiring policy, exact engagement/obligation caps and explicit testnet funding authorization. Retain code hashes and successful execution/replay/revocation/disable/recovery evidence in a current manifest. The financial provider dependency gate must be resolved first.
4. For a cross-chain case, current canonical messenger/transmitter addresses, domains, destination token/code hashes, reviewed zero-fee standard route, source message/attestation, and finalized exact recipient mint proof. Real compatibility must include the Circle SCA envelope; mock transactions and a successful arbitrary receipt are insufficient.
5. A persistent worker with private profile storage, renewal/expiry procedures, isolated key custody, monitoring and a tested restart/timeout reconciliation exercise. Submitted identities and liabilities survive credential or review expiry. Protection additionally requires explicit terms, collateral allocation and independent reviewer/recovery evidence before it is advertised.

## Verification and limitations

Run from `contracts/`:

```sh
forge test
forge test --gas-report
forge fmt --check src test
forge build --sizes
```

Foundry configuration pins Solidity `0.8.30`, Cancun EVM, optimizer and via-IR. Dependencies are vendored OpenZeppelin Contracts `5.4.0` and forge-std `1.10.0`; archive provenance is recorded in `DEPENDENCIES.json`, with upstream licenses preserved. Local tests include exact effect/replay checks, all permit-field tampering, cap exhaustion, expiry/epoch/version changes, midnight bursts, owner-controlled revocation, coverage binding, claims and recoveries, and restricted CCTP rollback. Stateful invariants run 128 sequences of depth 64 each for payment effects and reserve collateral conservation; fuzz tests use 512 cases.

Tests use a Safe API mock, token mock and messenger mock. They do not prove compatibility with a specific deployed Safe, Circle MPC wallet or live Circle route; do not count them as mainnet/testnet settlements. No independent security audit has been performed. Before broad delegation, conduct independent source/composition review, verify deployed bytecode, run real Safe integration and verified testnet routes, and obtain explicit small real-money allocations. The fixed business Safe recovery destination avoids mutable payout-address authorization but inherits the security of that Safe's owner set. The design also inherits canonical-token issuer controls, chain finality and independent verifier/reviewer trust. Those limitations remain even when all local tests pass.
