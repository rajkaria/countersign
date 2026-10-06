import { atomic, timestamp, hourlyCharge, quantityUnits } from "./money";
import type { Decision, Finding, VerificationInput } from "./types";
const address = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);
/** Pure policy verification. Input identity/approvals must come from the authenticated repository, never extraction or model output. */
export function verifyObligation(input: VerificationInput): Decision {
  const { engagement: e, invoice: i, policy: p } = input;
  const findings: Finding[] = [];
  const add = (
    code: string,
    severity: Finding["severity"],
    message: string,
    sourceIds: string[] = [],
  ) => findings.push({ code, severity, message, sourceIds });
  let amount = input.requestedAmount ?? i.amount;
  let partial = false;
  let validity = input.now;
  try {
    const now = timestamp(input.now);
    const expiry = timestamp(p.expiresAt);
    const requested = atomic(amount);
    const invoiced = atomic(i.amount);
    const agreed = atomic(e.amount);
    const ceiling = atomic(e.commitmentCeiling);
    if (
      !Number.isInteger(e.version) ||
      e.version < 1 ||
      !Number.isInteger(i.version) ||
      i.version < 1 ||
      !Number.isInteger(p.version) ||
      p.version < 1
    )
      throw new Error("Invalid versions");
    if (
      !Number.isInteger(e.asset.decimals) ||
      e.asset.decimals < 0 ||
      e.asset.decimals > 36 ||
      !Number.isSafeInteger(e.asset.chainId) ||
      e.asset.chainId < 1 ||
      !address(e.asset.address)
    )
      throw new Error("Invalid settlement asset");
    if (
      !Number.isFinite(e.acceptanceMaxAgeSeconds) ||
      e.acceptanceMaxAgeSeconds <= 0 ||
      !Number.isFinite(input.historyMaxAgeSeconds) ||
      input.historyMaxAgeSeconds <= 0
    )
      throw new Error("Invalid freshness bounds");
    validity = new Date(Math.min(now + 300_000, expiry)).toISOString();
    if (
      [
        e.tenantId,
        i.tenantId,
        p.tenantId,
        ...input.allocations.map((a) => a.tenantId),
        ...input.acceptances.map((a) => a.tenantId),
      ].some((t) => t !== input.tenantId)
    )
      add(
        "TENANT_MISMATCH",
        "hold",
        "The records do not belong to the same organization.",
      );
    if (
      e.id !== i.engagementId ||
      e.vendorId !== i.vendorId ||
      e.version !== i.engagementVersion
    )
      add(
        "ENGAGEMENT_MISMATCH",
        "hold",
        "Invoice must match the current approved engagement and vendor.",
      );
    if (e.status !== "active" || !e.approvedBy || timestamp(e.approvedAt) > now)
      add(
        "TERMS_UNAPPROVED",
        "hold",
        "An authorized customer must activate the agreement.",
      );
    if (i.status === "received")
      add(
        "MATCHING_REQUIRED",
        "ask",
        "Match the extracted invoice to its approved obligation before release.",
      );
    if (i.status === "canceled" || i.status === "disputed")
      add(
        "INVOICE_BLOCKED",
        "hold",
        "Canceled or disputed invoices cannot be paid.",
      );
    const start = timestamp(i.periodStart),
      end = timestamp(i.periodEnd);
    if (
      end <= start ||
      start < timestamp(e.effectiveFrom) ||
      end > timestamp(e.effectiveUntil)
    )
      add(
        "TERM_PERIOD",
        "hold",
        "The billing period is outside these approved terms.",
      );
    timestamp(i.dueAt);
    if (i.currency !== e.currency || e.currency !== e.asset.symbol)
      add(
        "CURRENCY_MISMATCH",
        "hold",
        "A separately approved conversion quote is required for different invoice and settlement currencies.",
      );
    if (requested === 0n || invoiced === 0n || requested > invoiced)
      add(
        "INVALID_AMOUNT",
        "hold",
        "Payment must be positive and cannot exceed this invoice.",
      );
    let contractualAmount = agreed;
    if (e.billingModel === "hourly") {
      if (!e.hourlyRate || !e.maximumQuantity || !i.quantity)
        add(
          "HOURS_MISSING",
          "ask",
          "Approved rate and invoice quantity are required.",
        );
      else {
        const hours = quantityUnits(i.quantity),
          max = quantityUnits(e.maximumQuantity);
        contractualAmount = hourlyCharge(e.hourlyRate, i.quantity);
        if (hours > max)
          add(
            "HOURS_EXCEEDED",
            "hold",
            "Billed quantity exceeds the approved quantity.",
          );
      }
    }
    if (invoiced > contractualAmount)
      add(
        "RATE_MISMATCH",
        "hold",
        "Invoice exceeds the approved amount for this obligation.",
        [e.source.id, i.source.id],
      );
    const destination = e.destinations.find(
      (d) =>
        d.chainId === i.destination.chainId &&
        d.address.toLowerCase() === i.destination.address.toLowerCase() &&
        d.version === i.destination.version,
    );
    if (
      !address(i.destination.address) ||
      !destination ||
      !destination.verifiedBy ||
      timestamp(destination.verifiedAt) > now
    )
      add(
        "DESTINATION_CHANGED",
        "hold",
        "The destination must match the independently verified vendor register.",
        [i.source.id],
      );
    if (p.paused || p.version !== input.expectedPolicyVersion || expiry <= now)
      add(
        "POLICY_INACTIVE",
        "hold",
        "Policy is paused, superseded, or expired.",
      );
    if (
      requested > atomic(p.perPaymentCap) ||
      requested > atomic(p.remainingDelegation) ||
      requested > atomic(p.rolling24hRemaining)
    )
      add(
        "POLICY_CAP",
        "hold",
        "Payment exceeds the available delegated spending limits.",
      );
    const seen = new Set<string>();
    let total = 0n,
      obligation = 0n,
      invoiceAllocated = 0n;
    for (const a of input.allocations) {
      if (seen.has(a.id)) throw new Error("Duplicate allocation records");
      seen.add(a.id);
      const value = atomic(a.amount);
      if (a.state === "released" || a.engagementId !== e.id) continue;
      total += value;
      if (a.obligationId === i.obligationId) obligation += value;
      if (a.invoiceId === i.id) invoiceAllocated += value;
    }
    if (total + requested > ceiling)
      add(
        "ENGAGEMENT_CAP",
        "hold",
        "Paid and pending allocations exceed the engagement commitment ceiling.",
      );
    if (obligation + requested > contractualAmount)
      add(
        "OBLIGATION_CAP",
        "hold",
        "This obligation is already paid or committed in whole or in part. Changing an invoice number cannot create a new obligation.",
      );
    if (invoiceAllocated + requested > invoiced)
      add(
        "INVOICE_CAP",
        "hold",
        "Paid and pending amounts exceed the invoice balance.",
      );
    partial = requested < invoiced - invoiceAllocated;
    if (
      partial &&
      (!e.partialPayments ||
        (e.minimumPartial !== undefined &&
          requested < atomic(e.minimumPartial)))
    )
      add(
        "PARTIAL_APPROVAL_REQUIRED",
        "ask",
        "Approve the exact partial-payment terms before release.",
      );
    const lastSync = timestamp(input.historySyncedAt);
    validity = new Date(
      Math.min(
        timestamp(validity),
        lastSync + input.historyMaxAgeSeconds * 1000,
      ),
    ).toISOString();
    if (lastSync > now || now - lastSync > input.historyMaxAgeSeconds * 1000)
      add(
        "HISTORY_STALE",
        "hold",
        "Reconcile current payment history before creating another payment.",
      );
    if (input.unmatchedExternalTransfers)
      add(
        "EXTERNAL_PAYMENT_UNMATCHED",
        "hold",
        "Match the external transfer to its obligation before paying.",
      );
    if (e.acceptanceRequired) {
      const valid = input.acceptances.filter(
        (a) =>
          a.engagementId === e.id &&
          a.engagementVersion === e.version &&
          a.obligationId === i.obligationId &&
          a.kind === "acceptance" &&
          !a.revoked &&
          e.authorizedAcceptors.includes(a.actorId) &&
          timestamp(a.acceptedAt) <= now &&
          timestamp(a.acceptedAt) >= timestamp(e.approvedAt) &&
          timestamp(a.expiresAt) > now &&
          now - timestamp(a.acceptedAt) <= e.acceptanceMaxAgeSeconds * 1000 &&
          timestamp(a.source.observedAt) <= now,
      );
      if (!valid.length)
        add(
          "ACCEPTANCE_REQUIRED",
          "ask",
          "Ask an authorized customer acceptor to confirm this obligation; activity alone is insufficient.",
        );
      else
        validity = new Date(
          Math.min(
            timestamp(validity),
            ...valid.map((a) =>
              Math.min(
                timestamp(a.expiresAt),
                timestamp(a.acceptedAt) + e.acceptanceMaxAgeSeconds * 1000,
              ),
            ),
          ),
        ).toISOString();
    }
    if (p.coverageRequired && !input.coverageReserved)
      add(
        "COVERAGE_REQUIRED",
        "hold",
        "Reserve the full advertised liability against this payment before delegated execution.",
      );
    if (e.mode !== "delegate")
      add(
        "HUMAN_EXECUTION_REQUIRED",
        "info",
        e.mode === "observe"
          ? "Observe mode provides analysis without payment authority."
          : "Prepare mode requires the existing human signing process.",
      );
  } catch (error) {
    amount = "0";
    add(
      "INVALID_INPUT",
      "hold",
      error instanceof Error ? error.message : "Malformed verification input",
    );
  }
  const hold = findings.find((f) => f.severity === "hold");
  const ask = findings.find((f) => f.severity === "ask");
  const action = hold
    ? "HOLD"
    : ask
      ? partial && ask.code === "PARTIAL_APPROVAL_REQUIRED"
        ? "PROPOSE_PARTIAL"
        : "ASK"
      : "PAY";
  return {
    schemaVersion: 1,
    tenantId: input.tenantId,
    invoiceId: i.id,
    invoiceVersion: i.version,
    engagementId: e.id,
    engagementVersion: e.version,
    policyVersion: p.version,
    action,
    executable: action === "PAY" && e.mode === "delegate",
    amount,
    reason:
      hold?.message ??
      ask?.message ??
      "Approved terms, acceptance, destination, and available allocations match.",
    findings,
    evaluatedAt: input.now,
    validUntil: validity,
    nextCheck:
      action === "PAY"
        ? "Revalidate all release conditions immediately before execution."
        : "Reevaluate when the missing evidence or approval is supplied.",
    sourceIds: [
      ...new Set([
        e.source.id,
        i.source.id,
        ...input.acceptances.map((a) => a.source.id),
      ]),
    ],
    availableActions:
      action === "PAY"
        ? ["PAY", "SCHEDULE", "HOLD"]
        : ["HOLD", "ASK", ...(partial ? ["PROPOSE_PARTIAL" as const] : [])],
  };
}
export function diffDecisions(before: Decision, after: Decision) {
  if (
    before.tenantId !== after.tenantId ||
    before.invoiceId !== after.invoiceId
  )
    throw new Error(
      "Decisions must refer to the same organization and invoice",
    );
  return {
    actionChanged: before.action !== after.action,
    from: before.action,
    to: after.action,
    addedSources: after.sourceIds.filter((x) => !before.sourceIds.includes(x)),
    resolvedFindings: before.findings.filter(
      (x) => !after.findings.some((y) => y.code === x.code),
    ),
    newFindings: after.findings.filter(
      (x) => !before.findings.some((y) => y.code === x.code),
    ),
    versionsChanged:
      before.engagementVersion !== after.engagementVersion ||
      before.policyVersion !== after.policyVersion ||
      before.invoiceVersion !== after.invoiceVersion,
    amountChanged: before.amount !== after.amount,
  };
}
