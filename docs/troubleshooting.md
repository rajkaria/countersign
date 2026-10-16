# Resolve a finding

A finding identifies what needs attention. Start with its recorded reason, exact source versions and responsible person. Resolve the condition, then run a new review. Clearing one finding does not guarantee that every other check passes.

## Find the next action

| What you see                      | What it means                                     | Who should act                               | Next step                                                                         |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Acceptance required               | Current authorized acceptance is absent           | Named customer acceptor with an allowed role | Confirm the exact obligation and terms, then review again                         |
| Terms mismatch                    | Invoice and agreement versions disagree           | Authorized agreement owner                   | Review the amendment, rebind the invoice and obtain any newly required acceptance |
| Destination changed               | Address, chain or destination version differs     | Owner and independent destination verifier   | Review the controlled destination change                                          |
| Obligation cap reached            | Settled or reserved amounts consume capacity      | Operator or approver                         | Inspect original payments and allocations before preparing anything new           |
| History stale                     | Observed payment history is too old               | Authorized operator                          | Refresh and reconcile Safe history, then review again                             |
| External payment unmatched        | An outgoing effect lacks an explained allocation  | Authorized operator                          | Classify the original transfer using independent evidence                         |
| Policy cap or expiry              | Proposal exceeds permitted authority              | Authorized policy owner                      | Review the exact policy through its authority path                                |
| Hours or partial approval missing | Required quantity or installment terms are absent | Authorized agreement owner                   | Correct the request or approve a bounded amendment                                |

The [verification guide](/docs/verification) lists exact finding codes. [Agreements](/docs/agreements), [destinations](/docs/vendors) and [planning](/docs/planning) describe the corresponding controls.

## The decision says PAY, but nothing moved

PAY means supplied release checks pass. In Observe or Prepare it is analysis or a proposal, not spending authority. Financial execution on the current public deployment is disabled. Delegate additionally requires current exact permits, reviewed installed controls, provider compatibility and operational readiness. Check [the three modes](/docs/security) and [release status](/docs/release-status).

## A request timed out

Find the original operation and stable identity. A timeout leaves the outcome unknown; it does not prove failure or release reserved capacity. Reconcile source and destination evidence. Do not create a new operation because the first response is missing. Use the [recovery playbook](/docs/recovery). A database hold cannot revoke a signed on-chain permit.

## You cannot confirm acceptance

The wallet must have an owner or approver role and appear in the agreement's acceptor list. Being an operator, viewer or Safe owner alone is insufficient. Check the current organization, exact engagement and named acceptor. A vendor correction link cannot approve payment or change the trusted destination. Read [permissions](/docs/security).

## Sign-in or a workspace is unavailable

The [walkthrough](/review) and [sample workspace](/workspace) work without private login. For the private workspace use an injected EOA wallet or an exact external-wallet challenge. An authentication signature grants no spending permission.

Request a new challenge if the old one expired. Editing the address discards its challenge and signature. Never enter a private key or recovery phrase into the app. If persistence is unavailable, an operator must resolve the database or encryption issue. Real records are never silently stored in memory. See [external-wallet instructions](/docs/getting-started#sign-with-an-external-wallet) and [deployment diagnostics](/docs/deployment).

## Readiness is green, but a provider is not ready

Application health and database readiness are separate from financial route readiness. A 200 response does not establish a Safe installation, independent contract review, custody recovery or Circle compatibility. Review [integration requirements](/docs/integrations).

## Prepare a useful handoff

Record the finding code, entity identity, exact version, time and action attempted. Keep raw originals, cookies, private keys and personal information out of public support materials. Share private evidence only through an authorized channel. A receipt helps explain a decision but cannot replace missing independent evidence.
