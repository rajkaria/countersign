import { createDemoFixture, verifyObligation } from "./domain";
import type { VerificationInput } from "./domain";
import { runRecoveryScenario } from "./demo";

export const reviewerCases = [
  { id: "acceptance", title: "Activity is not acceptance", subtitle: "A shipped deliverable still needs the right person's sign-off.", change: "Add synthetic owner acceptance" },
  { id: "correction", title: "Corrections need fresh authority", subtitle: "Version 1 acceptance cannot silently approve version 2 terms.", change: "Accept synthetic version 2" },
  { id: "partial", title: "Pay the remainder exactly once", subtitle: "A partial allocation follows the obligation across invoice names.", change: "Record synthetic first half" },
  { id: "duplicate", title: "Renaming does not create a debt", subtitle: "The obligation identity survives a different invoice reference.", change: "Rename the synthetic invoice" },
  { id: "uncertain", title: "A timeout is not permission to retry", subtitle: "Keep the original operation until its outcome is reconciled.", change: "Run synthetic timeout" },
] as const;
export type ReviewerCase = (typeof reviewerCases)[number]["id"];

/** No network, providers or authority mutations. Same verifier used by the server. */
export function reviewerTrace(id: ReviewerCase, changed = false) {
  let input: VerificationInput = createDemoFixture(id === "acceptance" && !changed ? "missing-acceptance" : id === "duplicate" ? "duplicate" : id === "partial" ? "partial" : "ready");
  if (id === "correction") input = {
    ...input,
    engagement: { ...input.engagement, version: 2 },
    invoice: { ...input.invoice, engagementVersion: 2, version: 2 },
    acceptances: input.acceptances.map((a) => ({ ...a, engagementVersion: changed ? 2 : 1 })),
  };
  if (id === "partial" && changed) input = {
    ...input,
    allocations: [{ id: "fixture-first-half", tenantId: input.tenantId, engagementId: input.engagement.id, obligationId: input.invoice.obligationId, invoiceId: "fixture-prior-invoice", paymentId: "fixture-prior-payment", amount: "400000000", state: "settled" }],
  };
  if (id === "duplicate" && changed) input = { ...input, invoice: { ...input.invoice, id: "fixture-renamed", reference: "NEW-NAME-1042" } };
  if (id === "uncertain" && changed) input = { ...input, allocations: [{ id: "fixture-uncertain-allocation", tenantId: input.tenantId, engagementId: input.engagement.id, obligationId: input.invoice.obligationId, invoiceId: input.invoice.id, paymentId: "op_sample_0042", amount: input.invoice.amount, state: "submitted" }] };
  const decision = verifyObligation(input);
  return {
    schemaVersion: 1, classification: "synthetic fixture — not customer, model or provider evidence", scenario: id, changed,
    reducer: "verifyObligation", input, decision,
    execution: id === "uncertain" && changed ? runRecoveryScenario("timeout") : null,
    authorization: "No signature, transaction, approved production record or external action is created.",
  };
}
