import { atomic, timestamp } from "./money";
export type CoverageAllocation = Readonly<{
  id: string;
  paymentId: string;
  invoiceId: string;
  tenantId: string;
  permitHash: string;
  cap: string;
  recoveryDestination: string;
  termsVersion: number;
  state: "reserved" | "released" | "claimed";
  settledAt?: string;
  expiresAt?: string;
}>;
export type CoverageClaim = Readonly<{
  id: string;
  coverageId: string;
  filedAt: string;
  loss: string;
  priorRecovery: string;
  evidenceHash: string;
  state: "pending" | "approved" | "rejected" | "paid";
  approved?: string;
  reviewer?: string;
  reviewedAt?: string;
  transaction?: string;
}>;
export type CoveragePool = Readonly<{
  funded: string;
  otherLiabilities: string;
  paidClaims: string;
  allocations: readonly CoverageAllocation[];
  claims: readonly CoverageClaim[];
}>;
function activeLiability(pool: CoveragePool) {
  return pool.allocations
    .filter((a) => a.state === "reserved")
    .reduce((sum, a) => sum + atomic(a.cap), atomic(pool.otherLiabilities));
}
export function coverageCapacity(pool: CoveragePool): string {
  const free = atomic(pool.funded) - activeLiability(pool);
  if (free < 0n) throw new Error("Reserve is undercollateralized");
  return free.toString();
}
/** Repository must serialize this reducer with reservation + authorization, and independently confirm reserve contract backing. */
export function reserveCoverage(
  pool: CoveragePool,
  input: Omit<CoverageAllocation, "state" | "settledAt" | "expiresAt">,
): CoveragePool {
  const amount = atomic(input.cap);
  if (
    !input.id ||
    !input.paymentId ||
    !input.invoiceId ||
    !input.tenantId ||
    !input.permitHash ||
    !input.recoveryDestination ||
    !Number.isInteger(input.termsVersion) ||
    input.termsVersion < 1 ||
    amount <= 0n
  )
    throw new Error("Invalid coverage binding");
  if (
    pool.allocations.some(
      (a) => a.id === input.id || a.paymentId === input.paymentId,
    )
  )
    throw new Error("Payment coverage already exists");
  if (amount > atomic(coverageCapacity(pool)))
    throw new Error("Insufficient reserved protection capacity");
  return {
    ...pool,
    allocations: [...pool.allocations, { ...input, state: "reserved" }],
  };
}
export function confirmCoveredSettlement(
  pool: CoveragePool,
  id: string,
  settledAt: string,
): CoveragePool {
  const a = pool.allocations.find((a) => a.id === id);
  if (!a || a.state !== "reserved" || a.settledAt)
    throw new Error("Allocation cannot be settled again");
  const expiresAt = new Date(
    timestamp(settledAt) + 14 * 86400_000,
  ).toISOString();
  return {
    ...pool,
    allocations: pool.allocations.map((a) =>
      a.id === id ? { ...a, settledAt, expiresAt } : a,
    ),
  };
}
export function fileClaim(
  pool: CoveragePool,
  input: Omit<
    CoverageClaim,
    "state" | "approved" | "reviewer" | "reviewedAt" | "transaction"
  >,
): CoveragePool {
  const a = pool.allocations.find((a) => a.id === input.coverageId);
  if (!a || a.state !== "reserved" || !a.settledAt || !a.expiresAt)
    throw new Error("Settled active coverage is required");
  if (
    timestamp(input.filedAt) < timestamp(a.settledAt) ||
    timestamp(input.filedAt) > timestamp(a.expiresAt)
  )
    throw new Error("Outside filing window");
  if (pool.claims.some((c) => c.id === input.id || c.coverageId === a.id))
    throw new Error("Duplicate claim; appeal the existing case");
  if (atomic(input.loss) <= atomic(input.priorRecovery) || !input.evidenceHash)
    throw new Error("Independent net-loss evidence required");
  return { ...pool, claims: [...pool.claims, { ...input, state: "pending" }] };
}
export function adjudicateClaim(
  pool: CoveragePool,
  id: string,
  input: {
    approved: string;
    reviewer: string;
    evidenceHash: string;
    at: string;
  },
): CoveragePool {
  const c = pool.claims.find((c) => c.id === id);
  if (!c || c.state !== "pending") throw new Error("Pending claim required");
  const a = pool.allocations.find((a) => a.id === c.coverageId)!;
  const approved = atomic(input.approved);
  if (
    !input.reviewer ||
    !input.evidenceHash ||
    timestamp(input.at) < timestamp(c.filedAt) ||
    approved > atomic(a.cap) ||
    approved > atomic(c.loss) - atomic(c.priorRecovery)
  )
    throw new Error("Claim exceeds evidenced loss or reserved cap");
  return {
    ...pool,
    claims: pool.claims.map((c) =>
      c.id === id
        ? {
            ...c,
            state: approved > 0n ? "approved" : "rejected",
            approved: input.approved,
            reviewer: input.reviewer,
            reviewedAt: input.at,
          }
        : c,
    ),
  };
}
export function settleClaim(
  pool: CoveragePool,
  id: string,
  input: { transaction: string; amount: string; destination: string },
): CoveragePool {
  const c = pool.claims.find((c) => c.id === id);
  if (!c || c.state !== "approved" || !c.approved)
    throw new Error("Approved unpaid claim required");
  const a = pool.allocations.find((a) => a.id === c.coverageId)!;
  if (
    !input.transaction ||
    pool.claims.some((c) => c.transaction === input.transaction) ||
    input.destination !== a.recoveryDestination ||
    atomic(input.amount) !== atomic(c.approved)
  )
    throw new Error("Claim payout does not match approved terms");
  const funded = atomic(pool.funded) - atomic(input.amount);
  if (funded < 0n) throw new Error("Insufficient funded reserve");
  return {
    ...pool,
    funded: funded.toString(),
    paidClaims: (atomic(pool.paidClaims) + atomic(input.amount)).toString(),
    allocations: pool.allocations.map((a) =>
      a.id === c.coverageId ? { ...a, state: "claimed" } : a,
    ),
    claims: pool.claims.map((c) =>
      c.id === id ? { ...c, state: "paid", transaction: input.transaction } : c,
    ),
  };
}
export function releaseCoverage(
  pool: CoveragePool,
  id: string,
  now: string,
  terminalNonexecutionProof?: string,
): CoveragePool {
  const a = pool.allocations.find((a) => a.id === id);
  if (!a || a.state !== "reserved")
    throw new Error("Active allocation required");
  if (
    pool.claims.some(
      (c) =>
        c.coverageId === id && c.state !== "paid" && c.state !== "rejected",
    )
  )
    throw new Error("Pending claims retain capacity");
  if (
    a.expiresAt
      ? timestamp(now) <= timestamp(a.expiresAt)
      : !terminalNonexecutionProof
  )
    throw new Error(
      "Claim window or potentially executable permit retains capacity",
    );
  return {
    ...pool,
    allocations: pool.allocations.map((a) =>
      a.id === id ? { ...a, state: "released" } : a,
    ),
  };
}
export function withdrawReserve(
  pool: CoveragePool,
  amount: string,
): CoveragePool {
  if (atomic(amount) > atomic(coverageCapacity(pool)))
    throw new Error("Withdrawal impairs active liabilities");
  return { ...pool, funded: (atomic(pool.funded) - atomic(amount)).toString() };
}
