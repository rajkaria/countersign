import {
  createDemoFixture,
  verifyObligation,
  commitment,
  diffDecisions,
} from "./domain";
import type { VerificationInput } from "./domain";
import { runRecoveryScenario } from "./demo";
import { decisionEvidence, validateProposal } from "./integrations/agent";
import { sha256, stringToHex } from "viem";
import { z } from "zod";

export const reviewerCases = [
  {
    id: "acceptance",
    title: "Activity is not acceptance",
    subtitle: "A shipped deliverable still needs the right person's sign-off.",
    change: "Add synthetic owner acceptance",
  },
  {
    id: "correction",
    title: "Corrections need fresh authority",
    subtitle: "Version 1 acceptance cannot silently approve version 2 terms.",
    change: "Accept synthetic version 2",
  },
  {
    id: "partial",
    title: "Pay the remainder exactly once",
    subtitle:
      "A partial allocation follows the obligation across invoice names.",
    change: "Record synthetic first half",
  },
  {
    id: "duplicate",
    title: "Renaming does not create a debt",
    subtitle: "The obligation identity survives a different invoice reference.",
    change: "Rename the synthetic invoice",
  },
  {
    id: "uncertain",
    title: "A timeout is not permission to retry",
    subtitle: "Keep the original operation until its outcome is reconciled.",
    change: "Run synthetic timeout",
  },
] as const;
export type ReviewerCase = (typeof reviewerCases)[number]["id"];

/** No network, providers or authority mutations. Same verifier used by the server. */
export function reviewerTrace(id: ReviewerCase, changed = false) {
  let input: VerificationInput = createDemoFixture(
    id === "acceptance" && !changed
      ? "missing-acceptance"
      : id === "duplicate"
        ? "duplicate"
        : id === "partial"
          ? "partial"
          : "ready",
  );
  if (id === "correction")
    input = {
      ...input,
      engagement: { ...input.engagement, version: 2 },
      invoice: { ...input.invoice, engagementVersion: 2, version: 2 },
      acceptances: input.acceptances.map((a) => ({
        ...a,
        engagementVersion: changed ? 2 : 1,
      })),
    };
  if (id === "partial" && changed)
    input = {
      ...input,
      allocations: [
        {
          id: "fixture-first-half",
          tenantId: input.tenantId,
          engagementId: input.engagement.id,
          obligationId: input.invoice.obligationId,
          invoiceId: "fixture-prior-invoice",
          paymentId: "fixture-prior-payment",
          amount: "400000000",
          state: "settled",
        },
      ],
    };
  if (id === "duplicate" && changed)
    input = {
      ...input,
      invoice: {
        ...input.invoice,
        id: "fixture-renamed",
        reference: "NEW-NAME-1042",
      },
    };
  if (id === "uncertain" && changed)
    input = {
      ...input,
      allocations: [
        {
          id: "fixture-uncertain-allocation",
          tenantId: input.tenantId,
          engagementId: input.engagement.id,
          obligationId: input.invoice.obligationId,
          invoiceId: input.invoice.id,
          paymentId: "op_sample_0042",
          amount: input.invoice.amount,
          state: "submitted",
        },
      ],
    };
  const decision = verifyObligation(input);
  return {
    schemaVersion: 1,
    classification:
      "synthetic fixture — not customer, model or provider evidence",
    scenario: id,
    changed,
    reducer: "verifyObligation",
    input,
    decision,
    execution:
      id === "uncertain" && changed ? runRecoveryScenario("timeout") : null,
    authorization:
      "No signature, transaction, approved production record or external action is created.",
  };
}

const reviewerAnswerSchema = z
  .object({
    contextCommitment: z.string().regex(/^0x[0-9a-f]{64}$/),
    actorId: z.string().min(1).max(100),
    engagementVersion: z.number().int().positive(),
    obligationId: z.string().min(1).max(150),
    response: z.enum(["activity-only", "accept", "decline"]),
    confirmedSynthetic: z.literal(true),
  })
  .strict();
export type ReviewerAnswer = Omit<
  z.infer<typeof reviewerAnswerSchema>,
  "confirmedSynthetic"
> & { confirmedSynthetic: boolean };

/** Authored source text is frozen before either arm; no outcome or answer is inserted into model context. */
export function reviewerClarificationTrace(submitted?: ReviewerAnswer) {
  const base = createDemoFixture("missing-acceptance");
  const originals = [
    {
      id: base.engagement.source.id,
      location: "Agreement §2 · delivery and acceptance",
      text: "Fictional September design retainer, 800 USDC. Delivery includes a responsive dashboard and keyboard navigation review. Customer acceptor owner-1 must explicitly accept obligation design-2026-09 against agreement version 1. A merged handoff or vendor statement is delivery activity, not customer acceptance.",
    },
    {
      id: base.invoice.source.id,
      location: "Invoice total and billing period",
      text: "Fictional STUDIO-1042 requests 800 USDC for the September design retainer, obligation design-2026-09, agreement version 1. No destination, amount or terms change is requested.",
    },
    {
      id: base.acceptances[0].source.id,
      location: "Delivery handoff note",
      text: "Fictional delivery note: responsive dashboard merged; keyboard navigation review has been sent to the customer. No statement from owner-1 confirms that the September deliverables are accepted.",
    },
  ].map((source) => ({
    ...source,
    textSha256: sha256(stringToHex(source.text)).slice(2),
  }));
  const original = (id: string) =>
    originals.find((source) => source.id === id)!;
  const input: VerificationInput = {
    ...base,
    engagement: {
      ...base.engagement,
      mode: "observe",
      source: {
        ...base.engagement.source,
        hash: original(base.engagement.source.id).textSha256,
      },
    },
    invoice: {
      ...base.invoice,
      source: {
        ...base.invoice.source,
        hash: original(base.invoice.source.id).textSha256,
      },
    },
    acceptances: base.acceptances.map((acceptance) => ({
      ...acceptance,
      source: {
        ...acceptance.source,
        hash: original(acceptance.source.id).textSha256,
      },
    })),
  };
  const decision = verifyObligation(input);
  const evidence = decisionEvidence(input, decision).map((snapshot) => ({
    id: snapshot.id,
    content: JSON.stringify({
      normalizedSnapshot: JSON.parse(snapshot.content),
      original: original(snapshot.id),
    }),
  }));
  const frozen = {
    input,
    originals,
    evidence,
    contextCommitment: commitment({ input, evidence }),
  };
  const rules = {
    decision,
    question: `Ask authorized acceptor ${input.engagement.authorizedAcceptors.join(", ")} to explicitly accept obligation ${input.invoice.obligationId}, invoice ${input.invoice.reference}, against agreement v${input.engagement.version}. Activity alone is insufficient.`,
    contextCommitment: frozen.contextCommitment,
    classification:
      "Strong deterministic baseline; names, obligation and current version are included.",
  };
  const agentFixture = {
    modelExecuted: false as const,
    classification:
      "Authored recorded proposal fixture, not a model evaluation.",
    contextCommitment: frozen.contextCommitment,
    proposal: validateProposal(
      {
        action: "ASK",
        reason:
          "The contract requires customer acceptance of the responsive dashboard and keyboard navigation review. The handoff reports delivery and a review sent, which does not establish that the named customer accepted either deliverable.",
        sourceIds: originals.map((source) => source.id),
        missing: [
          "owner-1: have you reviewed and explicitly accepted the responsive dashboard and keyboard navigation review for September obligation design-2026-09 against agreement v1? If review is incomplete, identify what remains; a merged handoff alone cannot approve this invoice.",
        ],
      },
      {
        allowedActions: decision.availableActions,
        sourceIds: decision.sourceIds,
      },
    ),
  };
  let answer = null;
  let after = null;
  if (submitted !== undefined) {
    const parsed = reviewerAnswerSchema.parse(submitted);
    if (parsed.contextCommitment !== frozen.contextCommitment)
      throw new Error("The answer belongs to a different frozen context.");
    const observedAt = new Date(Date.parse(input.now) + 1000).toISOString();
    const statement =
      parsed.response === "accept"
        ? `Fictional ${parsed.actorId} explicitly accepts obligation ${parsed.obligationId} against agreement version ${parsed.engagementVersion}.`
        : parsed.response === "decline"
          ? `Fictional ${parsed.actorId} declines acceptance; review is incomplete.`
          : `Fictional ${parsed.actorId} reports delivery activity only; acceptance is not given.`;
    const source = {
      id: `synthetic-answer-${commitment(parsed).slice(2, 18)}`,
      uri: "fixture://submitted-human-answer",
      location: "Explicit synthetic reviewer submission",
      hash: sha256(stringToHex(statement)).slice(2),
      observedAt,
    };
    answer = {
      ...parsed,
      statement,
      source,
      classification:
        "Reviewer-submitted synthetic answer; no real identity or signature is authenticated.",
    };
    const updated: VerificationInput = {
      ...input,
      now: observedAt,
      acceptances: [
        ...input.acceptances,
        {
          id: source.id,
          tenantId: input.tenantId,
          engagementId: input.engagement.id,
          engagementVersion: parsed.engagementVersion,
          obligationId: parsed.obligationId,
          actorId: parsed.actorId,
          acceptedAt: observedAt,
          expiresAt: new Date(Date.parse(observedAt) + 86400000).toISOString(),
          kind: parsed.response === "accept" ? "acceptance" : "activity",
          revoked: false,
          source,
        },
      ],
    };
    after = { input: updated, decision: verifyObligation(updated) };
  }
  return {
    schemaVersion: 1,
    classification:
      "Synthetic comparison; no model run, customer outcome, signature or payment",
    frozen,
    rules,
    agentFixture,
    answer,
    after,
    diff: after ? diffDecisions(decision, after.decision) : null,
    limitations: [
      "A strong rules prompt can obtain the same valid answer. This fixture does not establish incremental model benefit.",
      "Model advantage requires a held-out comparison using actual source text and consented human work, recorded questions/answers and measured evidence.",
      "The selected answer type is explicit; narrative text is never interpreted as authorization. Observe-mode eligibility cannot execute a payment.",
    ],
  };
}
