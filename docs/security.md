# Authority stays deliberately narrow

The model proposes. The deterministic verifier checks release conditions. The constrained Safe module enforces the signed permit and configured spending limits. Human owners remain independently in control.

## What the model cannot do

- Activate an agreement or certify its own acceptance.
- Change a verified destination, budget, allowlist, policy or execution credential.
- Turn forecast revenue into available cash.
- Call a general-purpose signing shell or construct arbitrary contract calls.
- Treat instructions inside invoices, comments or retrieved pages as trusted commands.

## Application access

Wallet challenges bind the application origin, address, nonce and expiration. Challenges are single-use. Sessions are opaque random tokens, stored only as hashes server-side, carried in HttpOnly SameSite cookies and revocable at logout. Mutations require a matching origin. Tenant membership is checked before loading any object. Team roles and customer acceptance authority are separate checks.

All database tables containing user data enable row-level security without public policies. The server uses a dedicated private database-owner connection (which bypasses RLS); the application checks authenticated membership, roles, and organization predicates on every customer data path. RLS protects against accidental public Data API exposure, not a compromised server credential. Do not expose these tables through a public data API or grant anonymous access.

## Documents and privacy

Documents are encrypted before storage with authenticated tenant binding. Encryption keys belong in the deployment secret store. Losing the key makes encrypted evidence unrecoverable; back it up separately from the database. Public examples are synthetic until a customer explicitly consents to a redacted evidence capsule.

Uploads have size/type checks and are delivered as attachments. No document is executed. Never paste passwords, private keys or wallet recovery phrases. Model-provider data retention must be reviewed before sending real customer documents.

## Smart-contract boundaries

The Safe alone administers the module. Executor and verifier credentials cannot widen policy. Permits bind every money-affecting field, current versions, expiry, nonce, recipient and chain. There are no arbitrary delegatecalls or unrestricted token approvals. Rolling 24-hour caps use timestamped spending rather than midnight resets.

The recovery procedure works through the Safe owners and does not rely on the model or app host. A compromised verifier can still attest false off-chain facts within installed caps; the contracts cannot prove work quality. Protect the verifier separately from the executor.

## Release discipline

Automated tests and this project's internal review are not an independent audit. Broad mainnet delegation requires independent security review, verified deployment bytecode, documented operator ownership, small explicit initial allocations and exercised recovery. No real funds were moved to manufacture a demonstration.

## Permission and data boundaries

| Boundary | What it controls |
|---|---|
| Wallet session | Application identity for one authenticated wallet |
| Organization membership | Which tenant records the wallet can access |
| Application role | Which record/review operations are allowed |
| Agreement acceptor list | Who can provide contractual customer acceptance |
| Verified deployment | Which reviewed contracts and provider path may be used |
| Safe policy and exact permit | The independently enforced on-chain spending authority |

Passing one boundary does not satisfy the others. A business's application owner is not automatically a Safe owner. A Safe owner connecting to the app is not automatically a member of every workspace. An approver must still be named in the agreement to attest.

## Sensitive changes

Destination changes require a proposal and a separately authenticated confirmation, normally by another eligible reviewer. Clearing a manual hold and confirming history reconciliation require recent owner authentication. These checks protect changes in application authority; Safe owners still need independent on-chain revocation when a signed or broadcast operation is at risk.

The application records decisions, changes, approvals and controlled overrides with actor and version references. Audit history supports investigation; it does not prove that an authorized human's factual statement was true.

## Data minimization in practice

Use only documents the business has authorized for processing. Restrict intake keys to the configured forwarder, keep vendor links private, and agree retention before uploading customer evidence. The optional model provider receives selected evidence for configured tasks; review its applicable data handling before use. Model calls request no response storage, which is not a blanket promise about every provider retention behavior.

A redacted receipt can still reveal amounts, destinations and timing. Download permission is not permission to publish. Never include private keys, seed phrases, access tokens or private operational manifests in documents, prompts or public evidence.

## Trust that remains

Countersign depends on the authenticated business's records, the independent verifier, canonical token behavior, configured providers, chain finality and human Safe recovery. A verifier compromise can authorize false off-chain facts within installed limits. Contract constraints reduce available authority; they cannot establish the truth of delivery or remove every operational risk.

For the precise implemented controls and test limitations, read [contracts](/docs/contracts), [internal security review](/docs/security-review), [operations](/docs/operations) and [recovery](/docs/recovery).
