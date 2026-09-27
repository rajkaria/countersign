import { z } from "zod";
import { type Actor, requireRole, digest } from "./auth";
import { type Database, id, ServiceError } from "./db";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
} from "../integrations/manifest";
const text = z.string().trim().min(1).max(2000),
  uuid = z.uuid(),
  amount = z.string().regex(/^(0|[1-9][0-9]{0,35})$/),
  address = z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  date = z.iso.date();
export const schemas = {
  vendor: z.object({
    name: text,
    reference: z.string().max(120).default(""),
    destination: address,
    chainId: z.number().int().positive().safe(),
    verified: z.boolean().default(false),
    verificationNote: z.string().max(2000).default(""),
  }),
  engagement: z.object({
    vendorId: uuid,
    policyId: uuid.optional(),
    title: text,
    billing: z.enum(["retainer", "hourly", "milestone"]),
    currency: z.enum(["USD", "USDC"]).default("USDC"),
    amount,
    ceiling: amount,
    effectiveFrom: date,
    effectiveTo: date,
    acceptanceRequired: z.boolean(),
    acceptors: z.array(address).min(1),
    partialAllowed: z.boolean().default(false),
    mode: z.enum(["observe", "prepare", "delegate"]).default("observe"),
    sourceId: uuid.optional(),
    approved: z.boolean().default(false),
  }),
  invoice: z.object({
    vendorId: uuid,
    engagementId: uuid,
    engagementVersion: z.number().int().positive().optional(),
    reference: text,
    amount,
    currency: z.enum(["USD", "USDC"]).default("USDC"),
    periodStart: date,
    periodEnd: date,
    dueDate: date,
    destination: address,
    description: text,
    sourceId: uuid.optional(),
    status: z
      .enum([
        "received",
        "needs_review",
        "eligible",
        "scheduled",
        "authorized",
        "settling",
        "partially_paid",
        "paid",
        "canceled",
        "disputed",
      ])
      .default("received"),
    paidAmount: amount.default("0"),
  }),
  acceptance: z.object({
    engagementId: uuid,
    invoiceId: uuid,
    engagementVersion: z.number().int().positive(),
    statement: text,
    expiresAt: z.iso.datetime(),
    sourceId: uuid.optional(),
  }),
  case: z.object({
    invoiceId: uuid,
    vendorId: uuid,
    title: text,
    reason: text,
    owner: text,
    status: z
      .enum([
        "open",
        "awaiting_evidence",
        "awaiting_approval",
        "resolved",
        "reevaluated",
      ])
      .default("open"),
    resolution: z.string().max(2000).default(""),
  }),
  safe: z.object({
    name: text,
    address,
    chainId: z.number().int().positive().safe(),
    mode: z.literal("observe").default("observe"),
  }),
  policy: z.object({
    safeId: uuid,
    perPayment: amount,
    rolling24h: amount,
    totalAllocation: amount,
    cashFloor: amount,
    protectedAmount: amount,
    feeReserve: amount,
    expiresAt: z.iso.datetime().optional(),
    paused: z.boolean().default(true),
    coveredOnly: z.boolean().default(true),
  }),
  consent: z.object({
    subject: text,
    purpose: text,
    publicAllowed: z.boolean().default(false),
    expiresAt: z.iso.datetime(),
  }),
  metric: z.object({
    cohort: z.enum([
      "synthetic",
      "historical",
      "business_testnet",
      "founder_mainnet",
      "independent_mainnet",
    ]),
    kind: text,
    value: z.number().finite(),
    unit: text,
    source: text,
    consentId: uuid.optional(),
  }),
  evidence: z.object({
    invoiceId: uuid,
    kind: z.enum(["manual", "github", "external_payment"]),
    summary: text,
    source: text,
    observedAt: z.iso.datetime(),
    commitment: text,
  }),
} as const;
export type RecordKind = keyof typeof schemas;
export interface StoredRecord {
  id: string;
  version: number;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  kind: RecordKind;
  [key: string]: unknown;
}
export function kindOf(kind: string): RecordKind {
  if (!Object.hasOwn(schemas, kind))
    throw new ServiceError(404, "RESOURCE", "This resource does not exist.");
  return kind as RecordKind;
}
export async function audit(
  db: Database,
  actor: Actor,
  action: string,
  entityId: string,
  details: object = {},
) {
  await db.query(
    "INSERT INTO audit_events(id,organization_id,actor,action,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id(),
      actor.organizationId,
      actor.wallet,
      action,
      entityId,
      JSON.stringify(details),
    ],
  );
}
export async function listRecords(
  db: Database,
  actor: Actor,
  kind: RecordKind,
) {
  return (
    await db.query<StoredRecord>(
      "SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 500",
      [actor.organizationId, kind],
    )
  ).rows;
}
export async function getRecord(
  db: Database,
  actor: Actor,
  kind: RecordKind,
  recordId: string,
  lock = false,
) {
  const record = (
    await db.query<StoredRecord>(
      `SELECT id,kind,version,body,created_at,updated_at FROM records WHERE organization_id=$1 AND kind=$2 AND id=$3${lock ? " FOR UPDATE" : ""}`,
      [actor.organizationId, kind, recordId],
    )
  ).rows[0];
  if (!record)
    throw new ServiceError(
      404,
      "NOT_FOUND",
      "Record not found in this workspace.",
    );
  return record;
}
/** Caller must use one transaction: this shared lock serializes cross-engagement policy consumption and authority changes. */
export async function lockOrganization(db: Database, actor: Actor) {
  if (
    !(
      await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        actor.organizationId,
      ])
    ).rows.length
  )
    throw new ServiceError(404, "NOT_FOUND", "Workspace not found.");
}
export async function verifiedDeployment(
  db: Database,
  actor: Actor,
  safeId: string,
) {
  const safe = await getRecord(db, actor, "safe", safeId);
  try {
    const manifest = await loadDeploymentManifest();
    if (
      !manifest ||
      manifest.organizationId !== actor.organizationId ||
      manifest.safe.toLowerCase() !== String(safe.body.address).toLowerCase() ||
      manifest.chainId !== Number(safe.body.chainId)
    )
      throw new Error("Missing bound deployment evidence");
    const rpc = process.env.SOURCE_RPC_URL ?? process.env.ARC_RPC_URL;
    if (!rpc) throw new Error("Missing verification RPC");
    await verifyDeploymentManifest(manifest, rpc);
    return manifest;
  } catch {
    throw new ServiceError(
      409,
      "DELEGATION_GATE",
      "Delegate requires current verified deployment, Circle compatibility, recovery and security evidence for this exact Safe. Use Observe or Prepare until verification passes.",
    );
  }
}
/** Invalidation stops new application submission; it is not on-chain revocation or proof of failure. */
export async function invalidateUnsubmitted(
  db: Database,
  actor: Actor,
  reason: string,
  filter: { vendorId?: string; engagementId?: string; policyId?: string },
) {
  await db.query(
    `UPDATE payment_intents p SET invalidated_at=now(),invalidation_reason=$2,updated_at=now()
 WHERE p.organization_id=$1 AND p.state IN ('prepared','capacity_reserved','authorized') AND p.provider_id IS NULL AND p.source_tx IS NULL AND p.destination_tx IS NULL
 AND (($3::text IS NOT NULL AND p.engagement_id IN (SELECT id FROM records WHERE organization_id=$1 AND kind='engagement' AND body->>'vendorId'=$3))
 OR ($4::uuid IS NOT NULL AND p.engagement_id=$4) OR ($5::text IS NOT NULL AND (p.permit->>'policyId'=$5 OR p.permit->>'policyId' IS NULL)))`,
    [
      actor.organizationId,
      reason,
      filter.vendorId ?? null,
      filter.engagementId ?? null,
      filter.policyId ?? null,
    ],
  );
}
async function persistRecord(
  db: Database,
  actor: Actor,
  kind: RecordKind,
  entityId: string,
  version: number,
  body: Record<string, unknown>,
) {
  await db.query(
    `INSERT INTO records(organization_id,kind,id,version,body,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,kind,id) DO UPDATE SET version=EXCLUDED.version,body=EXCLUDED.body,updated_at=now()`,
    [
      actor.organizationId,
      kind,
      entityId,
      version,
      JSON.stringify(body),
      actor.wallet,
    ],
  );
  await db.query(
    "INSERT INTO record_versions(organization_id,kind,id,version,body,actor) VALUES($1,$2,$3,$4,$5,$6)",
    [
      actor.organizationId,
      kind,
      entityId,
      version,
      JSON.stringify(body),
      actor.wallet,
    ],
  );
}
async function reassess(
  db: Database,
  actor: Actor,
  kind: RecordKind,
  entityId: string,
  version: number,
) {
  await db.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'reassess',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",
    [
      id(),
      actor.organizationId,
      JSON.stringify({ kind, id: entityId, version }),
      `${actor.organizationId}:${kind}:${entityId}:${version}`,
    ],
  );
}
export async function saveRecord(
  db: Database,
  actor: Actor,
  kind: RecordKind,
  input: unknown,
  recordId?: string,
  expectedVersion?: number,
) {
  requireRole(
    actor,
    kind === "policy" || kind === "vendor" || kind === "engagement"
      ? ["owner"]
      : kind === "acceptance"
        ? ["owner", "approver"]
        : ["owner", "approver", "operator"],
  );
  const body: Record<string, unknown> = schemas[kind].parse(input);
  await lockOrganization(db, actor);
  const previous = recordId
    ? await getRecord(db, actor, kind, recordId, true)
    : undefined;
  if (previous && previous.version !== expectedVersion)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "This record changed. Refresh before saving.",
    );
  if (kind === "invoice") {
    const vendor = await getRecord(db, actor, "vendor", String(body.vendorId));
    const engagement = await getRecord(
      db,
      actor,
      "engagement",
      String(body.engagementId),
      true,
    );
    if (engagement.body.vendorId !== body.vendorId)
      throw new ServiceError(
        400,
        "VENDOR_MISMATCH",
        "Invoice vendor must match the engagement.",
      );
    if (
      previous &&
      (previous.body.engagementId !== body.engagementId ||
        previous.body.vendorId !== body.vendorId)
    )
      throw new ServiceError(
        409,
        "INVOICE_IDENTITY",
        "A correction cannot silently reassign the invoice obligation.",
      );
    if (
      previous &&
      ["authorized", "settling", "paid", "partially_paid"].includes(
        String(previous.body.status),
      )
    )
      throw new ServiceError(
        409,
        "LOCKED_INVOICE",
        "A committed invoice must be corrected with a separate adjustment.",
      );
    if (
      previous &&
      (
        await db.query(
          "SELECT id FROM payment_intents WHERE organization_id=$1 AND invoice_id=$2 AND (state!='failed' OR terminal_failure_proof IS NULL OR source_tx IS NOT NULL) LIMIT 1",
          [actor.organizationId, previous.id],
        )
      ).rows.length
    )
      throw new ServiceError(
        409,
        "LOCKED_INVOICE",
        "An allocated invoice must be reconciled or invalidated before correction.",
      );
    if (
      String(body.periodStart) > String(body.periodEnd) ||
      BigInt(String(body.amount)) <= 0n
    )
      throw new ServiceError(
        400,
        "INVOICE_TERMS",
        "Invoice amount and billing period are invalid.",
      );
    if (
      !previous &&
      body.engagementVersion !== undefined &&
      body.engagementVersion !== engagement.version
    )
      throw new ServiceError(
        409,
        "STALE_TERMS",
        "Invoice intake must bind to the reviewed current engagement version.",
      );
    body.engagementVersion =
      previous?.body.engagementVersion ?? engagement.version;
    body.destinationVersion =
      previous?.body.destinationVersion ??
      vendor.body.destinationVersion ??
      vendor.version;
    body.destinationChainId =
      previous?.body.destinationChainId ?? vendor.body.chainId;
    body.obligationId =
      previous?.body.obligationId ??
      `${engagement.id}:${body.periodStart}:${body.periodEnd}`;
    if (
      previous &&
      (previous.body.periodStart !== body.periodStart ||
        previous.body.periodEnd !== body.periodEnd)
    )
      throw new ServiceError(
        409,
        "OBLIGATION_IDENTITY",
        "Billing-period corrections require a new reviewed invoice; the obligation identity is immutable.",
      );
    body.status = previous?.body.status ?? "received";
    body.paidAmount = previous?.body.paidAmount ?? "0";
  }
  if (kind === "engagement") {
    await getRecord(db, actor, "vendor", String(body.vendorId));
    if (
      BigInt(String(body.amount)) > BigInt(String(body.ceiling)) ||
      String(body.effectiveFrom) > String(body.effectiveTo)
    )
      throw new ServiceError(
        400,
        "TERMS",
        "Engagement dates or ceiling are invalid.",
      );
    if (body.policyId)
      await getRecord(db, actor, "policy", String(body.policyId));
    if (body.mode === "delegate") {
      if (!body.policyId)
        throw new ServiceError(
          409,
          "DELEGATION_GATE",
          "Select the exact verified policy before delegation.",
        );
      const policy = await getRecord(
        db,
        actor,
        "policy",
        String(body.policyId),
      );
      await verifiedDeployment(db, actor, String(policy.body.safeId));
    }
    if (body.approved) {
      body.approvedBy = actor.wallet;
      body.approvedAt = new Date().toISOString();
    }
  }
  if (kind === "vendor") {
    if (body.verified && !String(body.verificationNote).trim())
      throw new ServiceError(
        400,
        "VERIFICATION",
        "Record how the vendor identity and destination were independently confirmed.",
      );
    if (
      previous &&
      (String(body.destination).toLowerCase() !==
        String(previous.body.destination).toLowerCase() ||
        body.chainId !== previous.body.chainId)
    )
      throw new ServiceError(
        409,
        "DESTINATION_CHANGE",
        "Use the separately authenticated destination-change workflow.",
      );
    body.destination = String(body.destination).toLowerCase();
    body.destinationVersion =
      previous?.body.destinationVersion ?? previous?.version ?? 1;
    body.destinationVerification =
      previous?.body.destinationVerification ?? "initial_owner_verification";
    if (body.verified) {
      body.verifiedBy = previous?.body.verifiedBy ?? actor.wallet;
      body.verifiedAt = previous?.body.verifiedAt ?? new Date().toISOString();
    }
  }
  if (kind === "acceptance") {
    const engagement = await getRecord(
      db,
      actor,
      "engagement",
      String(body.engagementId),
    );
    const invoice = await getRecord(
      db,
      actor,
      "invoice",
      String(body.invoiceId),
    );
    if (
      invoice.body.engagementId !== body.engagementId ||
      body.engagementVersion !== engagement.version ||
      body.engagementVersion !== invoice.body.engagementVersion ||
      !(engagement.body.acceptors as string[])
        .map((x) => x.toLowerCase())
        .includes(actor.wallet.toLowerCase()) ||
      Date.parse(String(body.expiresAt)) <= Date.now()
    )
      throw new ServiceError(
        403,
        "ACCEPTANCE",
        "Only a current authorized acceptor may attest to these exact terms.",
      );
    body.acceptedBy = actor.wallet;
    body.acceptedAt = new Date().toISOString();
    body.obligationId = invoice.body.obligationId;
    body.invoiceVersion = invoice.version;
    if (previous)
      throw new ServiceError(
        409,
        "IMMUTABLE",
        "Acceptance records are immutable; create a new attestation.",
      );
  }
  if (kind === "evidence")
    await getRecord(db, actor, "invoice", String(body.invoiceId));
  if (
    kind === "safe" &&
    previous &&
    (String(body.address).toLowerCase() !==
      String(previous.body.address).toLowerCase() ||
      body.chainId !== previous.body.chainId)
  )
    throw new ServiceError(
      409,
      "SAFE_IDENTITY",
      "Import a separate Safe record; existing payment authority cannot be reassigned.",
    );
  if (kind === "policy") {
    await getRecord(db, actor, "safe", String(body.safeId));
    if (
      BigInt(String(body.perPayment)) > BigInt(String(body.rolling24h)) ||
      BigInt(String(body.perPayment)) > BigInt(String(body.totalAllocation))
    )
      throw new ServiceError(
        400,
        "POLICY_LIMITS",
        "Per-payment allowance cannot exceed aggregate limits.",
      );
    body.expiresAt =
      body.expiresAt ??
      previous?.body.expiresAt ??
      new Date(Date.now() + 30 * 86400000).toISOString();
    if (Date.parse(String(body.expiresAt)) <= Date.now())
      throw new ServiceError(
        400,
        "POLICY_EXPIRY",
        "Policy expiry must be in the future.",
      );
    if (body.paused === false)
      await verifiedDeployment(db, actor, String(body.safeId));
  }
  if (kind === "case") {
    const invoice = await getRecord(
      db,
      actor,
      "invoice",
      String(body.invoiceId),
    );
    if (invoice.body.vendorId !== body.vendorId)
      throw new ServiceError(
        400,
        "CASE_VENDOR",
        "Case vendor must match the invoice.",
      );
  }
  if (body.sourceId) {
    const doc = await db.query(
      "SELECT 1 FROM documents WHERE organization_id=$1 AND id=$2",
      [actor.organizationId, body.sourceId],
    );
    if (!doc.rows.length)
      throw new ServiceError(404, "DOCUMENT", "Source document not found.");
  }
  const entityId = recordId ?? id(),
    version = (previous?.version ?? 0) + 1;
  await persistRecord(db, actor, kind, entityId, version, body);
  await audit(
    db,
    actor,
    `${kind}.${previous ? "updated" : "created"}`,
    entityId,
    { version },
  );
  if (previous && kind === "engagement")
    await invalidateUnsubmitted(
      db,
      actor,
      "Approved engagement version changed",
      { engagementId: entityId },
    );
  if (previous && kind === "policy")
    await invalidateUnsubmitted(db, actor, "Policy version changed", {
      policyId: entityId,
    });
  if (
    ["engagement", "vendor", "acceptance", "evidence", "policy"].includes(kind)
  )
    await reassess(db, actor, kind, entityId, version);
  return { id: entityId, kind, version, body };
}
export type Reauthentication = { sessionToken: string };
async function recentSession(
  db: Database,
  actor: Actor,
  proof: Reauthentication,
) {
  if (!proof.sessionToken)
    throw new ServiceError(
      401,
      "REAUTHENTICATION",
      "Sign in again to confirm this high-risk change.",
    );
  const tokenHash = digest(proof.sessionToken);
  const row = (
    await db.query<{ created_at: string; role: Actor["role"] }>(
      `SELECT s.created_at,m.role FROM sessions s JOIN members m ON m.wallet=s.wallet AND m.organization_id=$3 WHERE s.token_hash=$1 AND s.wallet=$2 AND s.expires_at>now() AND s.created_at<=now() AND s.created_at>now()-interval '5 minutes'`,
      [tokenHash, actor.wallet, actor.organizationId],
    )
  ).rows[0];
  if (!row)
    throw new ServiceError(
      401,
      "REAUTHENTICATION",
      "Sign in again to confirm this high-risk change.",
    );
  if (row.role !== actor.role)
    throw new ServiceError(
      403,
      "ROLE",
      "Your current workspace role cannot perform this action.",
    );
  return { tokenHash, createdAt: new Date(row.created_at).getTime() };
}
const destinationChangeSchema = z.object({
  vendorId: uuid,
  expectedVersion: z.number().int().positive(),
  destination: address,
  chainId: z.number().int().positive().safe(),
  reason: z.string().trim().min(12).max(2000),
  soloExceptionReason: z.string().trim().min(20).max(2000).optional(),
});
type DestinationChangeInput = z.infer<typeof destinationChangeSchema>;
export async function proposeDestinationChange(
  db: Database,
  actor: Actor,
  input: DestinationChangeInput,
  proof: Reauthentication,
) {
  requireRole(actor, ["owner"]);
  const body = destinationChangeSchema.parse(input);
  await lockOrganization(db, actor);
  const session = await recentSession(db, actor, proof);
  const vendor = await getRecord(db, actor, "vendor", body.vendorId, true);
  if (vendor.version !== body.expectedVersion)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "Vendor changed. Refresh before proposing new destination terms.",
    );
  if (
    String(vendor.body.destination).toLowerCase() ===
      body.destination.toLowerCase() &&
    Number(vendor.body.chainId) === body.chainId
  )
    throw new ServiceError(
      400,
      "UNCHANGED_DESTINATION",
      "The proposed destination is unchanged.",
    );
  const eligible = (
    await db.query<{ wallet: string }>(
      "SELECT wallet FROM members WHERE organization_id=$1 AND role IN ('owner','approver')",
      [actor.organizationId],
    )
  ).rows;
  if (
    body.soloExceptionReason &&
    (eligible.length !== 1 || eligible[0].wallet !== actor.wallet)
  )
    throw new ServiceError(
      409,
      "SOLO_EXCEPTION",
      "A different authorized owner or approver must confirm this workspace change.",
    );
  await db.query(
    "UPDATE destination_changes SET status='superseded' WHERE organization_id=$1 AND vendor_id=$2 AND status='pending' AND expires_at<=now()",
    [actor.organizationId, vendor.id],
  );
  const changeId = id();
  await db.query(
    "INSERT INTO destination_changes(id,organization_id,vendor_id,expected_version,previous_destination,previous_chain_id,destination,chain_id,reason,proposed_by,proposer_session_hash,solo_exception_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [
      changeId,
      actor.organizationId,
      vendor.id,
      vendor.version,
      vendor.body.destination,
      vendor.body.chainId,
      body.destination.toLowerCase(),
      body.chainId,
      body.reason,
      actor.wallet,
      session.tokenHash,
      body.soloExceptionReason ?? null,
    ],
  );
  await audit(db, actor, "vendor.destination_proposed", vendor.id, {
    changeId,
    expectedVersion: vendor.version,
    destination: body.destination.toLowerCase(),
    chainId: body.chainId,
    soloException: Boolean(body.soloExceptionReason),
  });
  return {
    id: changeId,
    status: "pending",
    requires: body.soloExceptionReason
      ? "fresh_second_sign_in"
      : "different_authorized_person",
  };
}
export async function confirmDestinationChange(
  db: Database,
  actor: Actor,
  changeId: string,
  proof: Reauthentication,
) {
  requireRole(actor, ["owner", "approver"]);
  uuid.parse(changeId);
  await lockOrganization(db, actor);
  const session = await recentSession(db, actor, proof);
  const proposal = (
    await db.query<{
      vendor_id: string;
      expected_version: number;
      destination: string;
      chain_id: string;
      reason: string;
      proposed_by: string;
      proposer_session_hash: string;
      solo_exception_reason: string | null;
      status: string;
      expires_at: string;
      created_at: string;
    }>(
      "SELECT * FROM destination_changes WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [actor.organizationId, changeId],
    )
  ).rows[0];
  if (!proposal || proposal.status !== "pending")
    throw new ServiceError(
      409,
      "DESTINATION_PROPOSAL",
      "This destination proposal is not pending.",
    );
  if (new Date(proposal.expires_at).getTime() <= Date.now())
    throw new ServiceError(
      409,
      "DESTINATION_PROPOSAL",
      "This destination proposal expired; create a fresh proposal.",
    );
  const proposer = (
    await db.query<{ role: string }>(
      "SELECT role FROM members WHERE organization_id=$1 AND wallet=$2",
      [actor.organizationId, proposal.proposed_by],
    )
  ).rows[0];
  if (proposer?.role !== "owner")
    throw new ServiceError(
      403,
      "ROLE",
      "The proposer no longer holds the required owner role.",
    );
  const solo = actor.wallet === proposal.proposed_by;
  if (solo) {
    const eligible = (
      await db.query<{ wallet: string }>(
        "SELECT wallet FROM members WHERE organization_id=$1 AND role IN ('owner','approver')",
        [actor.organizationId],
      )
    ).rows;
    if (
      !proposal.solo_exception_reason ||
      eligible.length !== 1 ||
      eligible[0].wallet !== actor.wallet
    )
      throw new ServiceError(
        403,
        "SECOND_PERSON",
        "A different authorized owner or approver must confirm this change.",
      );
    if (
      session.tokenHash === proposal.proposer_session_hash ||
      session.createdAt <= new Date(proposal.created_at).getTime()
    )
      throw new ServiceError(
        401,
        "REAUTHENTICATION",
        "Sign in again with a new wallet challenge after this proposal to record the solo exception.",
      );
  }
  const vendor = await getRecord(db, actor, "vendor", proposal.vendor_id, true);
  if (vendor.version !== proposal.expected_version)
    throw new ServiceError(
      409,
      "VERSION_CONFLICT",
      "Vendor changed after this proposal. Review and propose again.",
    );
  const version = vendor.version + 1,
    body = {
      ...vendor.body,
      destination: proposal.destination,
      chainId: Number(proposal.chain_id),
      destinationVersion:
        Number(vendor.body.destinationVersion ?? vendor.version) + 1,
      verified: true,
      verifiedBy: actor.wallet,
      verifiedAt: new Date().toISOString(),
      verificationNote: proposal.reason,
      destinationVerification: solo
        ? "solo_reauthenticated_exception"
        : "two_person_confirmation",
      destinationChangeId: changeId,
    };
  await persistRecord(db, actor, "vendor", vendor.id, version, body);
  await db.query(
    "UPDATE destination_changes SET status='confirmed',confirmed_by=$3,confirmed_at=now() WHERE organization_id=$1 AND id=$2",
    [actor.organizationId, changeId, actor.wallet],
  );
  await invalidateUnsubmitted(
    db,
    actor,
    "Vendor destination changed; fresh approval and chain policy required",
    { vendorId: vendor.id },
  );
  await reassess(db, actor, "vendor", vendor.id, version);
  await audit(db, actor, "vendor.destination_confirmed", vendor.id, {
    changeId,
    proposedBy: proposal.proposed_by,
    confirmedBy: actor.wallet,
    soloException: solo,
    version,
  });
  return { id: vendor.id, kind: "vendor" as const, version, body };
}

const reconciliationSchema = z.object({
  safeId: uuid,
  observationId: uuid,
  sourceDocumentIds: z.array(uuid).min(1).max(20),
  statement: z.string().trim().min(30).max(4000),
  transfers: z
    .array(
      z.object({
        transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        logIndex: z.number().int().nonnegative(),
        classification: z.enum([
          "countersign",
          "external_invoice",
          "non_payable",
        ]),
        paymentId: uuid.optional(),
        invoiceId: uuid.optional(),
        reason: z.string().trim().min(12).max(2000),
      }),
    )
    .max(10000),
});
/** Human reconciliation is evidence-backed attestation, not a claim that bounded RPC history is intrinsically complete. */
export async function confirmHistoryReconciliation(
  db: Database,
  actor: Actor,
  input: unknown,
  proof: Reauthentication,
) {
  requireRole(actor, ["owner"]);
  const body = reconciliationSchema.parse(input);
  await lockOrganization(db, actor);
  await recentSession(db, actor, proof);
  const safe = await getRecord(db, actor, "safe", body.safeId);
  const observation = (
    await db.query<{ id: string; body: Record<string, unknown> }>(
      "SELECT id,body FROM records WHERE organization_id=$1 AND kind='chain_observation' AND id=$2 AND body->>'safeId'=$3",
      [actor.organizationId, body.observationId, safe.id],
    )
  ).rows[0];
  if (
    !observation ||
    !observation.body.finalizedBlockHash ||
    !Array.isArray(observation.body.transfers)
  )
    throw new ServiceError(
      409,
      "HISTORY_OBSERVATION",
      "Select a finalized Safe observation in this workspace.",
    );
  if (
    Date.now() - Date.parse(String(observation.body.observedAt)) > 300000 ||
    Date.parse(String(observation.body.observedAt)) > Date.now()
  )
    throw new ServiceError(
      409,
      "HISTORY_STALE",
      "Sync the Safe again before reconciling its history.",
    );
  for (const documentId of new Set(body.sourceDocumentIds))
    if (
      !(
        await db.query(
          "SELECT id FROM documents WHERE organization_id=$1 AND id=$2",
          [actor.organizationId, documentId],
        )
      ).rows.length
    )
      throw new ServiceError(
        404,
        "DOCUMENT",
        "Every supporting statement must be a document in this workspace.",
      );
  type Transfer = {
    transactionHash: string;
    logIndex: number;
    from: string;
    to: string;
    amount: string;
    block: string;
  };
  const outgoing = (observation.body.transfers as Transfer[]).filter(
    (t) =>
      String(t.from).toLowerCase() === String(safe.body.address).toLowerCase(),
  );
  const key = (t: { transactionHash: string; logIndex: number }) =>
    `${t.transactionHash.toLowerCase()}:${t.logIndex}`;
  if (
    new Set(body.transfers.map(key)).size !== body.transfers.length ||
    body.transfers.length !== outgoing.length ||
    outgoing.some((t) => !body.transfers.some((c) => key(c) === key(t)))
  )
    throw new ServiceError(
      409,
      "UNMATCHED_TRANSFER",
      "Classify every observed outgoing transfer exactly once; missing or duplicate matches cannot be approved.",
    );
  const createdPayments: string[] = [];
  for (const match of body.transfers) {
    const transfer = outgoing.find((t) => key(t) === key(match))!;
    if (match.classification === "countersign") {
      if (!match.paymentId)
        throw new ServiceError(
          400,
          "PAYMENT_MATCH",
          "Select the matching Countersign payment.",
        );
      const payment = (
        await db.query<{ source_tx: string; amount: string }>(
          "SELECT source_tx,amount FROM payment_intents WHERE organization_id=$1 AND id=$2",
          [actor.organizationId, match.paymentId],
        )
      ).rows[0];
      if (
        !payment ||
        payment.source_tx?.toLowerCase() !==
          transfer.transactionHash.toLowerCase() ||
        payment.amount !== transfer.amount
      )
        throw new ServiceError(
          409,
          "PAYMENT_MATCH",
          "The payment does not match this exact source transaction and amount.",
        );
    } else if (match.classification === "external_invoice") {
      if (!match.invoiceId)
        throw new ServiceError(
          400,
          "INVOICE_MATCH",
          "Select the invoice paid by this external transfer.",
        );
      const invoice = await getRecord(db, actor, "invoice", match.invoiceId),
        engagement = await getRecord(
          db,
          actor,
          "engagement",
          String(invoice.body.engagementId),
          true,
        );
      if (
        String(invoice.body.destination).toLowerCase() !==
          String(transfer.to).toLowerCase() ||
        Number(invoice.body.destinationChainId) !== Number(safe.body.chainId) ||
        !/^[1-9][0-9]*$/.test(transfer.amount)
      )
        throw new ServiceError(
          409,
          "INVOICE_MATCH",
          "Recipient, chain and amount must match the external invoice settlement.",
        );
      const externalKey = `external:${body.safeId}:${key(transfer)}`;
      const existing = (
        await db.query<{ id: string; invoice_id: string }>(
          "SELECT id,invoice_id FROM payment_intents WHERE organization_id=$1 AND idempotency_key=$2",
          [actor.organizationId, externalKey],
        )
      ).rows[0];
      if (existing) {
        if (existing.invoice_id !== invoice.id)
          throw new ServiceError(
            409,
            "PAYMENT_MATCH",
            "This chain event is already allocated to a different invoice.",
          );
        continue;
      }
      const paymentId = id();
      await db.query(
        "INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit,source_tx,destination_tx,source_confirmed_at,settled_at) VALUES($1,$2,$3,$4,$5,$6,'settled',$7,$8,$8,$9,$9)",
        [
          paymentId,
          actor.organizationId,
          invoice.id,
          engagement.id,
          externalKey,
          transfer.amount,
          JSON.stringify({
            obligationId: invoice.body.obligationId,
            policyId: engagement.body.policyId,
            external: true,
            observationId: observation.id,
            logIndex: transfer.logIndex,
            matchedBy: actor.wallet,
            reason: match.reason,
          }),
          transfer.transactionHash,
          observation.body.observedAt,
        ],
      );
      createdPayments.push(paymentId);
      await invalidateUnsubmitted(
        db,
        actor,
        "External payment observed; reconcile allocations before preparing again",
        { engagementId: engagement.id },
      );
    }
  }
  const reconciliationId = id();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'history_reconciliation',$2,$3,$4)",
    [
      actor.organizationId,
      reconciliationId,
      JSON.stringify({
        ...body,
        finalizedBlockHash: observation.body.finalizedBlockHash,
        attestedBy: actor.wallet,
        attestedAt: new Date().toISOString(),
        createdPayments,
        scope: "owner_statement_plus_exact_observed_outgoing_transfer_matches",
        limitation:
          "Prior history completeness depends on the supplied statements and owner attestation.",
      }),
      actor.wallet,
    ],
  );
  await audit(db, actor, "history.reconciled", safe.id, {
    reconciliationId,
    observationId: observation.id,
    createdPayments,
    sourceDocumentIds: body.sourceDocumentIds,
  });
  return {
    id: reconciliationId,
    observationId: observation.id,
    createdPayments,
    attested: true,
    limitation:
      "Owner attestation and supplied statements establish earlier-history coverage; bounded RPC logs alone do not.",
  };
}
