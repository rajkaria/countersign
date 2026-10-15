# Review Countersign

Countersign connects agreements, invoices, authorized acceptance and payment history before proposing a payment. The useful unit is an obligation: renaming an invoice does not create a new debt, and correcting an agreement does not carry old acceptance into new terms.

## Start with the working walkthrough

Open the [product walkthrough](https://www.usecountersign.xyz/review). No wallet or account is required. Each case uses the same pure verifier as the authenticated server. The fixed snapshot, acceptances, addresses and allocation records are **synthetic fixtures**.

1. **Activity is not acceptance.** Start with activity-only evidence and see ASK. Compare the strong rules prompt with a recorded clarification fixture, then submit an explicit synthetic answer. A named acceptor's current-version acceptance makes the invoice eligible in Observe mode; a delivery update, decline, vendor approval or different-version answer leaves the acceptance requirement unresolved. No payment is created.
2. **Corrections need fresh authority.** Inspect version 2 terms with version 1 acceptance. Apply synthetic version 2 acceptance and re-run the same checks.
3. **Pay the remainder exactly once.** Inspect a 400 USDC request against an 800 USDC obligation. Record a synthetic 400 allocation; the second request remains 400. The current invoice name does not erase the prior allocation.
4. **Renaming does not create a debt.** Rename an already allocated invoice. The same obligation remains held.
5. **A timeout is not permission to retry.** Run the execution reducer. The original operation remains uncertain; another submission is rejected until reconciliation.

Use **Inspect exact verifier input & output** and **Download fixture trace** to inspect the complete reducer input and output. These JSON files are reproducible demonstrations, not signed receipts, customer records or provider observations. Reducer eligibility is distinct from permitted production execution.

## Inspect a question, answer and re-verification

The first case presents a **frozen clarification comparison**. Its fictional agreement covers a responsive dashboard and keyboard navigation review. A handoff note says that work was merged and a review sent to the customer; it does not contain the named customer's acceptance.

The strong rules baseline already names the authorized acceptor, exact obligation and current agreement version. The recorded proposal fixture ties its question to the specific deliverables and the unresolved review described in the source text. **No model was executed to create this public fixture.** A strong rules prompt can obtain the same valid answer; a more detailed question alone does not establish model advantage.

1. Inspect the cited original text and exact SHA-256 values. The normalized verifier input and model evidence are included in one frozen context commitment before either approach. Both start at ASK.
2. Choose a fictional responder, explicit answer and terms version. The default delivery update supplies no acceptance. These controls simulate identities and do not authenticate a real user.
3. Confirm that the answer is fictional, then select **Submit synthetic answer**. Only this explicit submission creates the browser-local answer evidence; the recorded proposal cannot answer its own question.
4. Try `vendor-1` acceptance or an answer for version 2. The actual verifier keeps ASK because the current authorized acceptor and approved version do not match. Declining acceptance also keeps ASK.
5. Submit `owner-1` acceptance for version 1. The verifier changes ASK → PAY eligibility, while `executable` stays false in Observe mode. Amount, invoice, approved terms, destination, policy and prior allocations remain unchanged. Both comparison approaches receive the same answer and re-verification result.
6. **Download clarification trace** preserves the original context, both prompts, the separate submitted answer with source identity and hash, and the before/after inputs, findings and decision diff. The original context commitment remains unchanged after the answer. Editing responder, answer, version or acknowledgement clears the previous result until a new answer is submitted. **Reset case** clears the answer and returns to the original gap.

An explicit answer type is used instead of interpreting free text as approval. In production, obtaining and recording acceptance still requires the actual authenticated authorized customer and the current obligation/terms binding; the fictional identity selector is not that authentication workflow.

## What would establish incremental agent value?

The useful hypothesis is that a model can connect ambiguous original language to the exact missing condition and ask a question that reduces operator investigation. It is not allowed to relax a rule or independently declare the work accepted. An explanation of the existing ASK result is insufficient evidence of that hypothesis.

Use held-out, consented original text and identical point-in-time inputs for prior workflow, strong rules, and rules plus agent. Give the rules baseline the same known approver, obligation, versions and constraints. Preserve actual model/provider/prompt identity, context commitments, cited proposed questions, separately recorded human answers and deterministic re-verification. Record correctly identified missing conditions, citation fidelity, incorrect assertions, additional operator lookups or actual review time with evidence. Do not send outcome labels to the model or infer a benefit from polished prose, identical final actions or synthetic timings.

The public comparison implements this inspection flow, not a completed experiment. Generalized question quality, measured operator benefit and real customer outcomes remain unproven. The separate recorded synthetic provider check below does not establish those outcomes. The portable pilot runner and capture instructions are described in [evaluation](/docs/evaluation).

## Explore the product

- [Full synthetic workspace](https://www.usecountersign.xyz/workspace): review invoices, inspect source traces, plan commitments and explore operations.
- In [the workspace](https://www.usecountersign.xyz/workspace), select **Review NS-1042**, then **Inspect synthetic source text** and **Recorded model proposal fixture**. The authored model fixture is labeled; it is not an executed model run. [Evidence view](https://www.usecountersign.xyz/workspace/evidence) lists the actual evidence gaps.
- [Recovery lab](https://www.usecountersign.xyz/workspace/recovery): duplicate obligations, changed destination, stale acceptance, source-only confirmation, uncertain execution and unfunded protection.
- [Authenticated workspace setup](https://www.usecountersign.xyz/console): redacted configuration and dedicated-database diagnostics. Dedicated persistence is configured for synthetic records; sign-in and organization membership are required to access it.

## Trace implementation to source

The application repository contains these inspectable paths. Repository access and license are separate owner release decisions.

| Concern | Source | Evidence |
|---|---|---|
| Obligation checks | `src/lib/domain/verifier.ts` | `tests/domain` and downloadable walkthrough traces |
| Planning | `src/lib/domain/planner.ts` | Production planner tests; explicitly synthetic balance input in the demo |
| Proposal-only assistant | `src/lib/integrations/agent.ts` and agent-review API | Bounded actions, allowlisted citations, model/provider/prompt provenance; fixture tests are not paid model evaluations |
| Complete-source extraction | `src/lib/server/extraction.ts` | Original commitment and typed suggestion tests; never activates terms |
| Versioned corrections and partials | `src/lib/server/obligations.ts` | Workflow and accounting tests |
| Constrained execution | `contracts/src/CountersignModule.sol`, `scripts/worker.ts` | Contract invariants, exact permits and operation-preserving reconciliation tests |
| Circle/Arc observation | `src/lib/integrations/circle.ts`, `chain.ts`, `manifest.ts` | Adapter tests and activation checks; genuine deployed compatibility/recovery remains required |
| Portable pilot measurement | `scripts/pilot.ts` | Freeze/check/record/export; actual consented observations must be supplied |

Run the shipped verification commands in the README. Passing fixture, container or contract tests proves the behavior under those inputs; it does not establish real customers, reviewed deployed contracts, wallet compatibility or delivered USDC.

## What the agent can and cannot do

An explicitly invoked model can extract a complete original and explain tenant-authorized evidence. Its structured proposal selects only deterministic allowed actions and cites only supplied sources. The console exposes its missing questions and model/prompt/response identity. An old proposal is labeled with its original invoice and terms binding; it is never current payment authority.

Approved terms, authorized acceptance, treasury capacity, permits and actual destination settlement stay outside model authority. A background agent does not get to release money by deciding an invoice looks plausible.

## Live evidence and limits

### Recorded activation checks on 16 October 2026

A dedicated Neon PostgreSQL workspace was migrated and exercised with synthetic records. The retained evidence includes 76 HTTP checks covering persistence and access boundaries, plus 24 logical restore and local key-recovery checks. These checks establish operation with fictional inputs; they do not establish a real customer or business.

One separately approved actual DeepSeek Flash request over a fictional missing-acceptance case returned ASK with source-bound questions. The recorded response used 3,971 input tokens and 368 output tokens and took 2,685 ms. This is provider compatibility evidence, separate from the authored public comparison fixture. It is not measured human benefit, a customer result or a continuing permission to make paid requests.

A separate manual local-EOA transfer of 1 USDC finalized on Arc Testnet as `0x842ad7cdf80bec26be7cfa2b839b462b2e263c207aec2215694e5a832238af7f`. It was not Circle Agent Wallet execution or a Countersign invoice payment. No mainnet payment is represented.

An operations-only Railway worker was activated with notices and payments disabled and an absolute stop at **18 October 2026, 20:00 UTC**. This bounded activation does not establish continuing hosting or financial execution.

Read [release status](/docs/release-status), [security review](/docs/security-review), [integrations](/docs/integrations) and [evaluation and pilot evidence](/docs/evaluation). Genuine business usage, Circle Agent Wallet compatibility, Countersign invoice execution, measured model benefit, saved time and funded protection remain unproven.

The isolated financial runtime retains an explicit provider dependency security gate: the 16 October audit retained two high and seven low findings. Execution stays disabled pending reviewed resolution, reviewed compatible deployment, separated custody and independent recovery, and exact owner authorization. No claim of rank, traction or independent audit follows from the public demo.
