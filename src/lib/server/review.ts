import { createHash } from "node:crypto";
import {
  verifyObligation,
  type VerificationInput,
  type Allocation,
  type Decision,
  type Finding,
} from "../domain";
import { type Actor, requireRole } from "./auth";
import { type Database, id, ServiceError } from "./db";
import {
  getRecord,
  listRecords,
  audit,
  lockOrganization,
  verifiedDeployment,
  type StoredRecord,
} from "./records";
export function obligationKey(
  engagementId: string,
  periodStart: string,
  periodEnd: string,
) {
  return `${engagementId}:${periodStart}:${periodEnd}`;
}
type PaymentRow = {
  id: string;
  invoice_id: string;
  engagement_id: string;
  state: string;
  amount: string;
  permit: Record<string, unknown>;
  source_tx: string | null;
  provider_id: string | null;
  source_confirmed_at: string | null;
  settled_at: string | null;
  terminal_failure_proof: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
};
const iso = (value: unknown) => new Date(String(value)).toISOString();
const remaining = (cap: unknown, used: bigint) => {
  const value = BigInt(String(cap ?? "0"));
  return (value > used ? value - used : 0n).toString();
};
const released = (p: PaymentRow) =>
  p.state === "failed" &&
  Boolean(p.terminal_failure_proof?.trim()) &&
  !p.source_tx;
function addHold(
  decision: Decision,
  code: string,
  message: string,
  sourceIds: string[] = [],
): Decision {
  const finding: Finding = { code, severity: "hold", message, sourceIds };
  return {
    ...decision,
    action: "HOLD",
    executable: false,
    reason: message,
    findings: [...decision.findings, finding],
    availableActions: ["HOLD", "ASK"],
    nextCheck:
      "Resolve the recorded discrepancy and reevaluate before payment.",
  };
}
/** Must run in the caller's transaction. All consumers acquire organization then engagement then invoice locks. */
export async function evaluateInvoice(
  db: Database,
  actor: Actor,
  invoiceId: string,
  excludePaymentId?: string,
) {
  requireRole(actor, ["owner", "approver", "operator"]);
  await lockOrganization(db, actor);
  const initial = await getRecord(db, actor, "invoice", invoiceId);
  const engagement = await getRecord(
    db,
    actor,
    "engagement",
    String(initial.body.engagementId),
    true,
  );
  const invoice = await getRecord(db, actor, "invoice", invoiceId, true),
    vendor = await getRecord(
      db,
      actor,
      "vendor",
      String(invoice.body.vendorId),
    );
  const policies = await listRecords(db, actor, "policy");
  const policy = engagement.body.policyId
    ? policies.find((p) => p.id === engagement.body.policyId)
    : policies.length === 1
      ? policies[0]
      : undefined;
  const safe = policy
    ? await getRecord(db, actor, "safe", String(policy.body.safeId))
    : undefined;
  const now = new Date().toISOString(),
    nowMs = Date.parse(now);
  const source = (record: StoredRecord, label: string) => ({
    id: record.id,
    uri: `record://${record.id}`,
    location: label,
    hash: createHash("sha256")
      .update(JSON.stringify(record.body))
      .digest("hex"),
    observedAt: iso(record.updated_at),
  });
  const obligationId = String(
    invoice.body.obligationId ??
      obligationKey(
        engagement.id,
        String(invoice.body.periodStart),
        String(invoice.body.periodEnd),
      ),
  );
  const allPayments = (
    await db.query<PaymentRow>(
      "SELECT * FROM payment_intents WHERE organization_id=$1",
      [actor.organizationId],
    )
  ).rows;
  if (excludePaymentId) {
    const current = allPayments.find((p) => p.id === excludePaymentId);
    if (
      !current ||
      current.invoice_id !== invoiceId ||
      current.engagement_id !== engagement.id
    )
      throw new ServiceError(
        409,
        "REVALIDATION_IDENTITY",
        "Only the current invoice payment intent can be excluded during revalidation.",
      );
  }
  const payments = allPayments.filter((p) => p.id !== excludePaymentId);
  const policyPayments = payments.filter(
    (p) => !p.permit.policyId || p.permit.policyId === policy?.id,
  );
  let used = 0n,
    rolling = 0n;
  for (const p of policyPayments) {
    if (released(p)) continue;
    const value = BigInt(p.amount);
    used += value;
    const confirmed = p.source_confirmed_at ?? p.settled_at;
    // Unknown/pending network effects retain rolling capacity regardless of their age. Legacy settled rows lacking trustworthy event time remain conservative.
    if (
      p.state !== "settled" ||
      !confirmed ||
      new Date(confirmed).getTime() > nowMs - 86400000
    )
      rolling += value;
  }
  const allocations: Allocation[] = payments
    .filter((p) => p.engagement_id === engagement.id)
    .map((p) => ({
      id: p.id,
      tenantId: actor.organizationId,
      engagementId: engagement.id,
      obligationId: String(p.permit.obligationId ?? "unknown"),
      invoiceId: p.invoice_id,
      paymentId: p.id,
      amount: p.amount,
      state:
        p.state === "settled"
          ? "settled"
          : released(p)
            ? "released"
            : "reserved",
    }));
  const acceptances = (
    await db.query<StoredRecord>(
      "SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind='acceptance' AND body->>'invoiceId'=$2",
      [actor.organizationId, invoiceId],
    )
  ).rows;
  const observations = safe
    ? (
        await db.query<StoredRecord>(
          "SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind='chain_observation' AND body->>'safeId'=$2 ORDER BY created_at DESC LIMIT 1",
          [actor.organizationId, safe.id],
        )
      ).rows
    : [];
  const observation = observations[0];
  const reconciliation = observation
    ? (
        await db.query<StoredRecord>(
          "SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind='history_reconciliation' AND body->>'observationId'=$2 ORDER BY created_at DESC LIMIT 1",
          [actor.organizationId, observation.id],
        )
      ).rows[0]
    : undefined;
  const reconciled = Boolean(
    reconciliation &&
    reconciliation.body.finalizedBlockHash ===
      observation?.body.finalizedBlockHash &&
    Array.isArray(reconciliation.body.sourceDocumentIds) &&
    reconciliation.body.sourceDocumentIds.length > 0,
  );
  const historySyncedAt = observation
    ? String(observation.body.observedAt)
    : "1970-01-01T00:00:00Z";
  const unmatched = !reconciled;
  const destination = {
    chainId: Number(vendor.body.chainId),
    address: String(vendor.body.destination),
    version: Number(vendor.body.destinationVersion ?? vendor.version),
    verifiedBy: vendor.body.verified
      ? String(vendor.body.verifiedBy ?? "authenticated-owner")
      : "",
    verifiedAt: iso(vendor.body.verifiedAt ?? vendor.updated_at),
  };
  const delegate = engagement.body.mode === "delegate";
  const token = String(
    safe?.body.token ??
      process.env.USDC_TOKEN_ADDRESS ??
      "0x0000000000000000000000000000000000000000",
  );
  const input: VerificationInput = {
    tenantId: actor.organizationId,
    now,
    engagement: {
      id: engagement.id,
      tenantId: actor.organizationId,
      vendorId: vendor.id,
      version: engagement.version,
      approvedBy: engagement.body.approved
        ? String(engagement.body.approvedBy ?? "authenticated-owner")
        : "",
      approvedAt: iso(engagement.body.approvedAt ?? engagement.updated_at),
      status: engagement.body.approved ? "active" : "draft",
      mode: engagement.body.mode as "observe" | "prepare" | "delegate",
      effectiveFrom: `${engagement.body.effectiveFrom}T00:00:00Z`,
      effectiveUntil: `${engagement.body.effectiveTo}T23:59:59Z`,
      billingModel: engagement.body.billing as
        "retainer" | "hourly" | "milestone",
      currency: String(engagement.body.currency ?? "USDC"),
      amount: String(engagement.body.amount),
      commitmentCeiling: String(engagement.body.ceiling),
      partialPayments: Boolean(engagement.body.partialAllowed),
      authorizedAcceptors: (engagement.body.acceptors as string[]).map((x) =>
        x.toLowerCase(),
      ),
      acceptanceRequired: Boolean(engagement.body.acceptanceRequired),
      acceptanceMaxAgeSeconds: 86400,
      destinations: [destination],
      asset: {
        symbol: "USDC",
        chainId: Number(safe?.body.chainId ?? vendor.body.chainId),
        address: token,
        decimals: Number(safe?.body.decimals ?? 6),
      },
      source: source(engagement, "approved terms"),
    },
    invoice: {
      id: invoice.id,
      tenantId: actor.organizationId,
      vendorId: vendor.id,
      engagementId: engagement.id,
      engagementVersion: Number(invoice.body.engagementVersion ?? 0),
      version: invoice.version,
      obligationId,
      reference: String(invoice.body.reference),
      periodStart: `${invoice.body.periodStart}T00:00:00Z`,
      periodEnd: `${invoice.body.periodEnd}T23:59:59Z`,
      dueAt: `${invoice.body.dueDate}T23:59:59Z`,
      amount: String(invoice.body.amount),
      currency: String(invoice.body.currency),
      destination: {
        ...destination,
        version: Number(invoice.body.destinationVersion ?? 0),
        chainId: Number(invoice.body.destinationChainId ?? 0),
        address: String(invoice.body.destination),
      },
      description: String(invoice.body.description),
      source: source(invoice, "invoice"),
      status:
        invoice.body.status === "disputed"
          ? "disputed"
          : invoice.body.status === "canceled"
            ? "canceled"
            : "matched",
    },
    policy: {
      id: policy?.id ?? "unconfigured",
      tenantId: actor.organizationId,
      version: policy?.version ?? 1,
      paused: delegate ? Boolean(policy?.body.paused ?? true) : !policy,
      perPaymentCap: String(policy?.body.perPayment ?? "0"),
      remainingDelegation: remaining(policy?.body.totalAllocation, used),
      rolling24hRemaining: remaining(policy?.body.rolling24h, rolling),
      expiresAt: String(policy?.body.expiresAt ?? "1970-01-01T00:00:00Z"),
      coverageRequired: delegate && Boolean(policy?.body.coveredOnly ?? true),
    },
    expectedPolicyVersion: policy?.version ?? 1,
    acceptances: acceptances.map((a) => ({
      id: a.id,
      tenantId: actor.organizationId,
      engagementId: String(a.body.engagementId),
      engagementVersion: Number(a.body.engagementVersion),
      obligationId: String(a.body.obligationId ?? "unbound"),
      actorId: String(a.body.acceptedBy).toLowerCase(),
      acceptedAt: String(a.body.acceptedAt),
      expiresAt: String(a.body.expiresAt),
      kind: "acceptance",
      source: source(a, "customer acceptance"),
      revoked: a.body.invoiceVersion !== invoice.version,
    })),
    allocations,
    historySyncedAt,
    historyMaxAgeSeconds: 300,
    unmatchedExternalTransfers: unmatched,
    coverageReserved: false,
  };
  let decision = verifyObligation(input);
  const overlaps = (
    await db.query<StoredRecord>(
      `SELECT id,body FROM records WHERE organization_id=$1 AND kind='invoice' AND id<>$2 AND body->>'engagementId'=$3
 AND body->>'periodStart'<=$5 AND body->>'periodEnd'>=$4 AND (body->>'periodStart'<>$4 OR body->>'periodEnd'<>$5)
 AND (body->>'status'<>'canceled' OR EXISTS(SELECT 1 FROM payment_intents p WHERE p.organization_id=$1 AND p.invoice_id=records.id AND (p.state<>'failed' OR p.terminal_failure_proof IS NULL OR p.source_tx IS NOT NULL)))`,
      [
        actor.organizationId,
        invoice.id,
        engagement.id,
        invoice.body.periodStart,
        invoice.body.periodEnd,
      ],
    )
  ).rows;
  if (overlaps.length)
    decision = addHold(
      decision,
      "OVERLAPPING_OBLIGATION",
      "A different billing period overlaps an existing obligation. Resolve the overlap before allocating another payment.",
      overlaps.map((r) => r.id),
    );
  if (!policy)
    decision = addHold(
      decision,
      "POLICY_SELECTION_REQUIRED",
      "Select the exact policy and Safe for this engagement; ambiguous or missing policy selection cannot authorize payment.",
    );
  if (token === "0x0000000000000000000000000000000000000000")
    decision = addHold(
      decision,
      "ASSET_UNVERIFIED",
      "A verified settlement-token deployment is required before payment preparation.",
    );
  if (delegate && safe) {
    try {
      await verifiedDeployment(db, actor, safe.id);
    } catch {
      decision = addHold(
        decision,
        "DEPLOYMENT_UNVERIFIED",
        "Live delegation is unavailable until this exact Safe deployment and Circle execution path are verified.",
      );
    }
  }
  const decisionId = id();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,version,body,created_by) VALUES($1,'decision',$2,1,$3,$4)",
    [
      actor.organizationId,
      decisionId,
      JSON.stringify({ decision, input, obligationId }),
      actor.wallet,
    ],
  );
  await audit(db, actor, "invoice.evaluated", invoiceId, {
    decisionId,
    action: decision.action,
  });
  return { id: decisionId, decision, input };
}
export async function preparePayment(
  db: Database,
  actor: Actor,
  invoiceId: string,
  key: string,
) {
  requireRole(actor, ["owner", "approver", "operator"]);
  if (key.length < 8 || key.length > 160)
    throw new ServiceError(
      400,
      "IDEMPOTENCY_KEY",
      "Provide a stable operation key between 8 and 160 characters.",
    );
  await lockOrganization(db, actor);
  const existing = (
    await db.query<PaymentRow>(
      "SELECT * FROM payment_intents WHERE organization_id=$1 AND idempotency_key=$2",
      [actor.organizationId, key],
    )
  ).rows[0];
  if (existing) {
    if (existing.invoice_id !== invoiceId)
      throw new ServiceError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This operation key belongs to a different invoice.",
      );
    if (existing.invalidated_at)
      throw new ServiceError(
        409,
        "INVALIDATED_OPERATION",
        "This operation was invalidated; reconcile it before preparing a replacement.",
      );
    return { id: existing.id, state: existing.state, permit: existing.permit };
  }
  const result = await evaluateInvoice(db, actor, invoiceId);
  const blocking = result.decision.findings.filter(
      (f) => f.severity !== "info",
    ),
    requiresCoverage =
      blocking.length === 1 && blocking[0].code === "COVERAGE_REQUIRED";
  if (result.decision.action !== "PAY" && !requiresCoverage)
    throw new ServiceError(409, "PAYMENT_HELD", result.decision.reason);
  if (result.input.engagement.mode === "observe")
    throw new ServiceError(
      409,
      "OBSERVE_ONLY",
      "Observe mode is read-only. Approve Prepare mode to create a human payment proposal.",
    );
  const invoice = await getRecord(db, actor, "invoice", invoiceId),
    paymentId = id();
  const permit = {
    decisionId: result.id,
    invoiceVersion: invoice.version,
    engagementVersion: result.decision.engagementVersion,
    policyId: result.input.policy.id,
    policyVersion: result.decision.policyVersion,
    obligationId: result.input.invoice.obligationId,
    destination: invoice.body.destination,
    amount: result.decision.amount,
    expiresAt: result.decision.validUntil,
    requiresCoverage,
  };
  await db.query(
    "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,$2,$3,$4,$5,$6,'prepared',$7)",
    [
      paymentId,
      actor.organizationId,
      invoiceId,
      invoice.body.engagementId,
      key,
      result.decision.amount,
      JSON.stringify(permit),
    ],
  );
  await audit(db, actor, "payment.prepared", paymentId, {
    requiresCoverage,
    executionMode: result.input.engagement.mode,
  });
  return { id: paymentId, state: "prepared", permit };
}
