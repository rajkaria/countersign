import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyObligation } from "../domain/verifier";
import { atomic, hourlyCharge } from "../domain/money";
import { commitment } from "../domain/receipt";
import { createPilotTemplates, inspectPilot, type PilotSession } from "../domain/pilot";
import { decisionEvidence, proposeDecisionWithModel } from "../integrations/agent";
import { boundedJson, type Fetcher } from "../integrations/http";

const id = z.string().trim().min(1).max(200);
const date = z.string().datetime({ offset: true });
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const units = z.string().refine((value) => { try { atomic(value); return true; } catch { return false; } }, "Expected canonical uint256 atomic units");
const sourceHash = z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const source = z.object({ id, uri: z.string().max(2000), location: z.string().max(1000), hash: sourceHash, observedAt: date }).strict();
const actor = z.string().max(200);
const destination = z.object({ chainId: version, address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), version, verifiedBy: actor, verifiedAt: date.or(z.literal("")) }).strict();
const engagement = z.object({
  id, tenantId: id, vendorId: id, version, approvedBy: actor, approvedAt: date.or(z.literal("")),
  status: z.enum(["draft", "active", "revoked"]), mode: z.enum(["observe", "prepare", "delegate"]),
  effectiveFrom: date, effectiveUntil: date, billingModel: z.enum(["retainer", "hourly", "milestone"]),
  currency: id, amount: units, hourlyRate: units.optional(), maximumQuantity: z.string().max(100).optional(),
  commitmentCeiling: units, partialPayments: z.boolean(), minimumPartial: units.optional(),
  authorizedAcceptors: z.array(id).max(100), acceptanceRequired: z.boolean(), acceptanceMaxAgeSeconds: z.number().finite().positive(),
  destinations: z.array(destination).max(100),
  asset: z.object({ symbol: id, chainId: version, address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), decimals: z.number().int().min(0).max(36) }).strict(), source,
}).strict();
const invoice = z.object({
  id, tenantId: id, vendorId: id, engagementId: id, engagementVersion: version, version,
  obligationId: id, reference: id, periodStart: date, periodEnd: date, dueAt: date,
  amount: units, currency: id, destination, description: z.string().max(20_000), source,
  quantity: z.string().max(100).optional(), status: z.enum(["received", "matched", "disputed", "canceled"]),
}).strict();
const acceptance = z.object({
  id, tenantId: id, engagementId: id, engagementVersion: version, obligationId: id, actorId: id,
  acceptedAt: date, expiresAt: date, kind: z.enum(["acceptance", "activity"]), source, revoked: z.boolean(),
}).strict();
const allocation = z.object({
  id, tenantId: id, engagementId: id, obligationId: id, invoiceId: id, paymentId: id, amount: units,
  state: z.enum(["reserved", "submitted", "settled", "released"]),
}).strict();
export const pilotVerificationInputSchema = z.object({
  tenantId: id, now: date, engagement, invoice,
  policy: z.object({ id, tenantId: id, version, paused: z.boolean(), perPaymentCap: units, remainingDelegation: units, rolling24hRemaining: units, expiresAt: date, coverageRequired: z.boolean() }).strict(),
  expectedPolicyVersion: version, acceptances: z.array(acceptance).max(1000), allocations: z.array(allocation).max(1000),
  historySyncedAt: date, historyMaxAgeSeconds: z.number().finite().positive(), unmatchedExternalTransfers: z.boolean(),
  requestedAmount: units.optional(), coverageReserved: z.boolean().optional(),
}).strict();
export const pilotArmInputSchema = z.object({
  verification: pilotVerificationInputSchema,
  originals: z.array(z.object({
    sourceId: id, sourceHash, textSha256: digest, kind: z.enum(["original-text", "excerpt"]),
    location: z.string().min(1).max(1000), content: z.string().min(1).max(20_000),
  }).strict()).min(1).max(50),
}).strict();
const externalConsent = z.object({
  businessId: id, caseId: id, frozenCommitment: z.string().regex(/^0x[0-9a-f]{64}$/),
  evidenceId: id, provider: z.literal("openai"), grantedAt: date, expiresAt: date, revokedAt: date.nullable(),
}).strict();
export const pilotRunConfigSchema = z.object({
  schemaVersion: z.literal(1), runId: id, trustedFrozenCommitment: z.string().regex(/^0x[0-9a-f]{64}$/),
  codeCommit: z.string().regex(/^[0-9a-f]{40}$/).nullable(), rulesVersion: id,
  assetBinding: z.object({ studyAssetId: id, symbol: id, chainId: version, address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), decimals: z.number().int().min(0).max(36), termsCurrency: id, invoiceCurrency: id }).strict(),
  model: z.string().trim().min(1).max(100).nullable(), externalModelConsent: externalConsent.nullable(),
}).strict();
export function createArmTemplates() {
  return {
    input: { verification: null, originals: [] },
    config: { schemaVersion: 1, runId: null, trustedFrozenCommitment: null, codeCommit: null, rulesVersion: null, assetBinding: null, model: null, externalModelConsent: null },
  };
}
const normalizeHash = (value: string) => value.replace(/^0x/, "").toLowerCase();
export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Strong deterministic clarification baseline; names and versions come only from the frozen input. */
function clarificationBaseline(input: z.infer<typeof pilotVerificationInputSchema>, rules: ReturnType<typeof verifyObligation>) {
  const context = "obligation " + input.invoice.obligationId + " (invoice " + input.invoice.reference + "), engagement " + input.engagement.id + " version " + input.engagement.version;
  return rules.findings.filter((finding) => finding.severity !== "info").map((finding, questionIndex) => {
    let text: string;
    switch (finding.code) {
      case "ACCEPTANCE_REQUIRED":
        text = "Ask " + (input.engagement.authorizedAcceptors.join(", ") || "an owner to configure an authorized acceptor") +
          " for explicit current acceptance of " + context + ". Activity alone is insufficient; retain actor, exact obligation, terms version and timestamp.";
        break;
      case "TERMS_UNAPPROVED":
        text = "Ask an authorized organization owner to review and activate " + context + ". The current draft/revoked/unapproved record cannot authorize payment.";
        break;
      case "DESTINATION_CHANGED":
        text = "Ask an independent authorized owner to verify the invoice destination against the versioned vendor register for " + context + ". A vendor message does not approve a recipient change.";
        break;
      case "RATE_MISMATCH":
        text = "Request a corrected invoice or an explicitly owner-approved terms amendment for " + context + "; billed amount exceeds the current contractual basis.";
        break;
      case "HOURS_MISSING":
        text = "Obtain the approved hourly rate and actual billed quantity for " + context + "; neither may be invented.";
        break;
      case "HOURS_EXCEEDED":
        text = "Reconcile billed quantity " + input.invoice.quantity + " against approved maximum " + input.engagement.maximumQuantity + " for " + context + ".";
        break;
      default:
        text = finding.message + " Review " + context + "; re-run the unchanged verifier after obtaining the required evidence or explicit approval.";
    }
    return { questionIndex, findingCode: finding.code, text, sourceIds: finding.sourceIds.length ? finding.sourceIds : rules.sourceIds, status: "unanswered" };
  });
}

/** Adjudication and workflow outcomes never enter this model-facing envelope. */
export function preparePilotArms(value: unknown, caseId: string, rawConfig: unknown, now: string, withModel = true) {
  const config = pilotRunConfigSchema.parse(rawConfig);
  inspectPilot(value, now, config.trustedFrozenCommitment);
  const session = value as PilotSession;
  const c = session.frozen.data.cases.find((candidate) => candidate.caseId === caseId);
  if (!c) throw new Error("Unknown frozen case");
  const envelope = pilotArmInputSchema.parse(c.snapshot.content);
  const input = envelope.verification;
  if ([input.engagement.tenantId, input.invoice.tenantId, input.policy.tenantId,
       ...input.acceptances.map((record) => record.tenantId), ...input.allocations.map((record) => record.tenantId)]
      .some((tenantId) => tenantId !== c.businessId))
    throw new Error("Verification source records are outside the consented business scope");
  if (input.tenantId !== c.businessId || input.invoice.vendorId !== c.vendorId ||
      input.engagement.vendorId !== c.vendorId || Date.parse(input.now) !== Date.parse(c.snapshot.asOf) ||
      Date.parse(input.invoice.dueAt) !== Date.parse(c.dueAt) ||
      input.engagement.asset.decimals !== session.frozen.data.settlementAsset.decimals)
    throw new Error("Frozen case and verification identity/time/asset bindings do not match");
  const asset = input.engagement.asset, binding = config.assetBinding, studyAsset = session.frozen.data.settlementAsset;
  const identity = studyAsset.identity;
  if (!identity || identity.symbol !== asset.symbol || identity.chainId !== asset.chainId ||
      identity.address.toLowerCase() !== asset.address.toLowerCase() || identity.decimals !== asset.decimals)
    throw new Error("Frozen on-chain asset identity does not match the evaluation");
  if (binding.studyAssetId !== studyAsset.id || binding.symbol !== asset.symbol || binding.chainId !== asset.chainId ||
      binding.address.toLowerCase() !== asset.address.toLowerCase() || binding.decimals !== asset.decimals ||
      binding.termsCurrency !== input.engagement.currency || binding.invoiceCurrency !== input.invoice.currency ||
      input.engagement.currency !== asset.symbol || input.invoice.currency !== asset.symbol ||
      ![asset.symbol, "Test " + asset.symbol].includes(studyAsset.label) ||
      (/^[A-Z]{3,6}$/i.test(studyAsset.id) && studyAsset.id.toUpperCase() !== asset.symbol.toUpperCase()))
    throw new Error("Exact settlement asset and currency mapping does not match the frozen study");
  // Use the verifier's full contractual basis, not a smaller partial invoice/request.
  const completeHourly = input.engagement.billingModel === "hourly" && input.engagement.hourlyRate && input.invoice.quantity;
  const fullObligation = completeHourly ? hourlyCharge(input.engagement.hourlyRate!, input.invoice.quantity!) : atomic(input.engagement.amount);
  if (atomic(c.obligationUnits) !== fullObligation)
    throw new Error("Frozen full obligation does not match the contractual amount basis");
  const cutoff = Date.parse(input.now);
  const sources = [input.engagement.source, input.invoice.source, ...input.acceptances.map((a) => a.source)];
  const priorDates = [input.engagement.approvedAt, input.invoice.destination.verifiedAt, input.historySyncedAt,
    ...input.engagement.destinations.map((d) => d.verifiedAt), ...sources.map((s) => s.observedAt), ...input.acceptances.map((a) => a.acceptedAt)];
  if (priorDates.some((value) => value !== "" && Date.parse(value) > cutoff))
    throw new Error("Future evidence is outside the frozen point-in-time context");
  const rules = verifyObligation(input);
  if (rules.findings.some((finding) => finding.code === "INVALID_INPUT"))
    throw new Error("Malformed verification input cannot become a model evaluation");
  if (rules.sourceIds.some((sourceId) => !c.snapshot.evidenceIds.includes(sourceId)))
    throw new Error("Decision source is absent from the frozen evidence IDs");
  const sourceRefs = new Map<string, string>();
  for (const ref of sources) {
    const hash = normalizeHash(ref.hash);
    if (sourceRefs.has(ref.id) && sourceRefs.get(ref.id) !== hash) throw new Error("Ambiguous source ID/hash binding");
    sourceRefs.set(ref.id, hash);
  }
  const duplicate = new Set<string>();
  for (const original of envelope.originals) {
    if (!rules.sourceIds.includes(original.sourceId) || !c.snapshot.evidenceIds.includes(original.sourceId))
      throw new Error("Original text cites an unavailable decision source");
    if (sourceRefs.get(original.sourceId) !== normalizeHash(original.sourceHash) || sha256(original.content) !== original.textSha256)
      throw new Error("Original source hash or exact text hash does not match");
    const key = original.sourceId + "/" + original.location;
    if (duplicate.has(key)) throw new Error("Ambiguous duplicate original source excerpt");
    duplicate.add(key);
  }
  const evidence = decisionEvidence(input, rules).map((record) => ({
    id: record.id,
    content: JSON.stringify({ normalized: JSON.parse(record.content), originals: envelope.originals.filter((text) => text.sourceId === record.id) }),
  }));
  if (evidence.length > 50 || evidence.some((record) => record.content.length > 20_000) ||
      evidence.reduce((n, record) => n + record.content.length, 0) > 100_000)
    throw new Error("Complete evidence exceeds model budget; use explicitly bound excerpts, never silent truncation");
  if (withModel) {
    const grant = config.externalModelConsent;
    if (!config.model || !grant || grant.businessId !== c.businessId || grant.caseId !== c.caseId ||
        grant.frozenCommitment !== session.frozen.commitment || grant.revokedAt !== null ||
        Date.parse(grant.grantedAt) > Date.parse(now) || Date.parse(grant.expiresAt) <= Date.parse(now) ||
        Date.parse(grant.expiresAt) <= Date.parse(grant.grantedAt))
      throw new Error("Active case-bound external model processing consent is required");
  }
  const rulesQuestions = clarificationBaseline(input, rules);
  const modelDecision = { ...rules, nextCheck: rulesQuestions.length ? rulesQuestions.map((q) => q.text).join("\n") : rules.nextCheck };
  return {
    schemaVersion: 1 as const, runId: config.runId, caseId: c.caseId, config,
    frozenCommitment: session.frozen.commitment, inputCommitment: c.inputCommitment,
    evidenceCommitment: commitment({ rules, rulesQuestions, modelDecision, evidence }), snapshot: envelope, rules, rulesQuestions, modelDecision, evidence,
    contractualBasis: completeHourly ? "hourly-rate-quantity" : input.engagement.billingModel === "hourly" ? "incomplete-hourly-declared-amount" : "fixed-terms-amount",
    policy: { id: input.policy.id, version: input.policy.version, engagementVersion: input.engagement.version, invoiceVersion: input.invoice.version },
    preparedAt: now, authority: "proposal-only" as const,
  };
}
export type PreparedPilotArms = ReturnType<typeof preparePilotArms>;

export async function executePilotAgent(
  prepared: PreparedPilotArms,
  options: { apiKey: string; fetcher: Fetcher; clock: () => string; revalidate: () => Promise<void>;
    saveRequest: (value: unknown) => Promise<void>; saveResponse: (value: unknown) => Promise<void> },
) {
  let calls = 0;
  let providerResponse: unknown = null;
  let dispatchedAt: string | null = null;
  let httpStatus: number | null = null;
  let responseObserved = false;
  let credentialRedacted = false;
  let failure = "Provider response is unknown or unusable; no automatic retry is allowed.";
  try {
    const agent = await proposeDecisionWithModel({ decision: prepared.modelDecision, evidence: prepared.evidence, apiKey: options.apiKey, model: prepared.config.model! }, async (url, init) => {
      if (++calls > 1 || url !== "https://api.openai.com/v1/responses" || init?.method !== "POST" || init.redirect !== "error")
        throw new Error("Model call exceeds the single fixed-endpoint budget");
      const body = JSON.parse(String(init.body));
      if (String(init.body).length > 120_000 || String(init.body).includes(options.apiKey))
        throw new Error("Model request exceeds its complete payload budget or contains credentials");
      await options.saveRequest({ endpoint: url, method: "POST", body, requestCommitment: commitment(body), maxCalls: 1, timeoutMilliseconds: 25_000 });
      failure = "Active consent or frozen binding changed before dispatch.";
      await options.revalidate();
      failure = "Provider response is unknown or unusable; no automatic retry is allowed.";
      dispatchedAt = options.clock();
      const response = await options.fetcher(url, init);
      httpStatus = response.status;
      // Preserve bounded raw provider evidence without request headers or credentials.
      let observed: unknown;
      try {
        const copy = response.clone();
        observed = await boundedJson(new Response(copy.body, { status: 200, headers: copy.headers }));
      } catch {
        await options.saveResponse({ httpStatus, bodyStatus: "invalid-or-oversized", noAutomaticRetry: true });
        throw new Error("Provider body is unusable");
      }
      responseObserved = true;
      const serialized = JSON.stringify(observed);
      credentialRedacted = serialized.includes(options.apiKey);
      providerResponse = {
        httpStatus, responseJsonSha256: sha256(serialized), credentialRedacted,
        data: credentialRedacted ? JSON.parse(serialized.split(options.apiKey).join("[REDACTED]")) : observed,
      };
      await options.saveResponse(providerResponse);
      if (!response.ok || credentialRedacted) throw new Error("Provider response cannot become usable model evidence");
      z.object({ id: z.string().min(1).max(200), model: z.string().min(1).max(200) }).parse(observed);
      return response;
    });
    failure = "Active consent or frozen binding changed after dispatch; returned proposal is not usable.";
    await options.revalidate();
    return { status: "complete" as const, agent, providerResponse, dispatchedAt, finishedAt: options.clock(), failure: null,
      failureDetails: null };
  } catch {
    // Arbitrary network/provider error strings can contain credentials. Never persist them.
    return { status: "unknown" as const, agent: null, providerResponse, dispatchedAt, finishedAt: options.clock(), failure,
      failureDetails: { httpStatus, responseObserved, credentialRedacted } };
  }
}
export function armMeasurementDraft(prepared: PreparedPilotArms, arm: "rules" | "rules-agent", action: PreparedPilotArms["rules"]["action"] | null) {
  return {
    ...createPilotTemplates().measurement, caseId: prepared.caseId, inputCommitment: prepared.inputCommitment,
    arm, action, decisionEvidenceId: prepared.runId + "/" + arm, appliedToWorkflow: false,
    dueOutcome: "not-observed" as const,
  };
}
