# Review Countersign

Countersign connects agreements, invoices, authorized acceptance and payment history before proposing a payment. The useful unit is an obligation: renaming an invoice does not create a new debt, and correcting an agreement does not carry old acceptance into new terms.

## Start with the working walkthrough

Open the [product walkthrough](https://countersign-jet.vercel.app/review). No wallet or account is required. Each case uses the same pure verifier as the authenticated server. The fixed snapshot, acceptances, addresses and allocation records are **synthetic fixtures**.

1. **Activity is not acceptance.** Start with activity-only evidence and see ASK. Add synthetic owner acceptance; the verifier becomes eligible. No payment is created.
2. **Corrections need fresh authority.** Inspect version 2 terms with version 1 acceptance. Apply synthetic version 2 acceptance and re-run the same checks.
3. **Pay the remainder exactly once.** Inspect a 400 USDC request against an 800 USDC obligation. Record a synthetic 400 allocation; the second request remains 400. The current invoice name does not erase the prior allocation.
4. **Renaming does not create a debt.** Rename an already allocated invoice. The same obligation remains held.
5. **A timeout is not permission to retry.** Run the execution reducer. The original operation remains uncertain; another submission is rejected until reconciliation.

Use **Inspect exact verifier input & output** and **Download fixture trace** to inspect the complete reducer input and output. These JSON files are reproducible demonstrations, not signed receipts, customer records or provider observations. Reducer eligibility is distinct from permitted production execution.

## Explore the product

- [Full synthetic workspace](https://countersign-jet.vercel.app/workspace): review invoices, inspect source traces, plan commitments and explore operations.
- In [the workspace](https://countersign-jet.vercel.app/workspace), select **Review NS-1042**, then **Inspect synthetic source text** and **Recorded model proposal fixture**. The authored model fixture is labeled; it is not an executed model run. [Evidence view](https://countersign-jet.vercel.app/workspace/evidence) lists the actual evidence gaps.
- [Recovery lab](https://countersign-jet.vercel.app/workspace/recovery): duplicate obligations, changed destination, stale acceptance, source-only confirmation, uncertain execution and unfunded protection.
- [Real-workspace setup](https://countersign-jet.vercel.app/console): redacted configuration and dedicated-database diagnostics. The public deployment currently has no real tenant persistence configured.

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

Read [release status](/docs/release-status), [security review](/docs/security-review), [integrations](/docs/integrations) and [evaluation and pilot evidence](/docs/evaluation). The current independent software release includes a working UI and supported adapter code. Real Circle/Arc payments, live model quality, customer adoption, saved time and funded protection remain unproven.

The isolated financial runtime retains an explicit provider dependency security gate. Execution stays disabled pending reviewed resolution, dedicated persistence, reviewed compatible deployment, recovery exercises and owner authorization. No claim of rank, traction or independent audit follows from the public demo.
