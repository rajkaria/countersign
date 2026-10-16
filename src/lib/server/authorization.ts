import { businessEvidenceCommitment } from "../domain/evidence";
import { randomBytes, randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, stringToHex, parseAbi, type Hex, type Address } from "viem";
import type { Actor } from "./auth";
import { type Database, ServiceError } from "./db";
import { evaluateInvoice } from "./review";
import { audit, lockOrganization } from "./records";
import {
  loadDeploymentManifest,
  verifyDeploymentManifest,
  assertCurrentDeploymentManifest,
} from "../integrations/manifest";
import { assertTestnetExecutionNetwork } from "../integrations/execution-network";
import {
  chainClient,
  checkModuleDeployment,
  DIRECT_ROUTE,
  CCTP_ROUTE,
} from "../integrations/chain";
import {
  moduleAbi,
  permitFields,
  permitTypedDataTypes,
  modulePermitSchema,
  permitDigest,
  type ModulePermit,
} from "../integrations/module";
import type { PaymentRow } from "./worker";
import { verifyObligation } from "../domain";
const bindingAbi = parseAbi([
  "function policyEpoch() view returns (uint256)",
  "function obligationEngagement(bytes32) view returns (bytes32)",
  "function obligationLimit(bytes32) view returns (uint256)",
  "function obligationPaid(bytes32) view returns (uint256)",
  "function engagements(bytes32) view returns (uint64 version,address recipient,uint256 destinationChainId,uint256 perPayment,uint256 rolling24h,uint256 lifetime,bool active)",
]);
/** Call inside transaction. Inputs contain only the existing payment ID; every money field is derived from approved stored data. */
export async function authorizePreparedPayment(
  db: Database,
  actor: Actor,
  paymentId: string,
) {
  if (actor.role !== "owner")
    throw new ServiceError(
      403,
      "OWNER_REQUIRED",
      "Only an authenticated workspace owner can authorize delegation.",
    );
  const manifest = await loadDeploymentManifest();
  if (
    !manifest ||
    manifest.organizationId !== actor.organizationId ||
    process.env.EXECUTION_ENABLED !== "true"
  )
    throw new ServiceError(
      503,
      "EXECUTION_GATED",
      "Verified deployment, Circle compatibility, review, and explicit execution activation are required.",
    );
  const rpc = process.env.SOURCE_RPC_URL || process.env.ARC_RPC_URL,
    key = process.env.VERIFIER_PRIVATE_KEY;
  if (!rpc || !key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new ServiceError(
      503,
      "VERIFIER_UNAVAILABLE",
      "Provision the isolated verifier and source RPC outside chat.",
    );
  const signer = privateKeyToAccount(key as Hex);
  if (signer.address.toLowerCase() !== manifest.verifier.toLowerCase())
    throw new ServiceError(
      503,
      "VERIFIER_BINDING",
      "Verifier signer does not match the reviewed deployment.",
    );
  await lockOrganization(db, actor);
  const row = (
    await db.query<PaymentRow>(
      "SELECT * FROM payment_intents WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [paymentId, actor.organizationId],
    )
  ).rows[0];
  if (!row) throw new ServiceError(404, "NOT_FOUND", "Payment not found.");
  if (row.invalidated_at)
    throw new ServiceError(
      409,
      "PAYMENT_INVALIDATED",
      "This authorization has been invalidated; reconcile or expire the existing permit.",
    );
  if (row.state === "authorized" && row.permit.modulePermit)
    return {
      id: row.id,
      state: row.state,
      permitDigest: permitDigest(
        modulePermitSchema.parse(row.permit.modulePermit),
      ),
    };
  if (row.state !== "prepared" || row.invalidated_at)
    throw new ServiceError(
      409,
      "PAYMENT_STATE",
      "Only a current prepared payment can be authorized.",
    );
  const result = await evaluateInvoice(db, actor, row.invoice_id, row.id);
  const blocking = result.decision.findings.filter(
    (f) => f.severity !== "info",
  );
  const coverageConditional =
    result.input.policy.coverageRequired &&
    blocking.length === 1 &&
    blocking[0].code === "COVERAGE_REQUIRED";
  const eligibilityDecision = coverageConditional
    ? verifyObligation({ ...result.input, coverageReserved: true })
    : result.decision;
  if (!eligibilityDecision.executable || eligibilityDecision.action !== "PAY")
    throw new ServiceError(409, "PAYMENT_HELD", eligibilityDecision.reason);
  const { input } = result;
  assertTestnetExecutionNetwork({
    chainId: input.engagement.asset.chainId,
    token: input.engagement.asset.address,
    tokenDecimals: input.engagement.asset.decimals,
    destinationChainId: input.invoice.destination.chainId,
  });
  await verifyDeploymentManifest(manifest, rpc);
  const client = chainClient(rpc),
    engagementId = keccak256(stringToHex(input.engagement.id)),
    obligationId = keccak256(stringToHex(input.invoice.obligationId));
  const [epoch, binding, limit, paid, engagement] = await Promise.all([
    client.readContract({
      address: manifest.module as Address,
      abi: bindingAbi,
      functionName: "policyEpoch",
    }),
    client.readContract({
      address: manifest.module as Address,
      abi: bindingAbi,
      functionName: "obligationEngagement",
      args: [obligationId],
    }),
    client.readContract({
      address: manifest.module as Address,
      abi: bindingAbi,
      functionName: "obligationLimit",
      args: [obligationId],
    }),
    client.readContract({
      address: manifest.module as Address,
      abi: bindingAbi,
      functionName: "obligationPaid",
      args: [obligationId],
    }),
    client.readContract({
      address: manifest.module as Address,
      abi: bindingAbi,
      functionName: "engagements",
      args: [engagementId],
    }),
  ]);
  if (
    binding !== engagementId ||
    limit < paid + BigInt(eligibilityDecision.amount) ||
    engagement[0] !== BigInt(input.engagement.version) ||
    engagement[1].toLowerCase() !==
      input.invoice.destination.address.toLowerCase() ||
    engagement[2] !== BigInt(input.invoice.destination.chainId) ||
    !engagement[6]
  )
    throw new ServiceError(
      409,
      "ONCHAIN_TERMS",
      "Safe owners must install matching bounded engagement and obligation terms.",
    );
  const cross = input.invoice.destination.chainId !== manifest.chainId;
  if (cross && !process.env.CCTP_DESTINATION_DOMAIN)
    throw new ServiceError(
      503,
      "ROUTE_GATED",
      "The verified customer destination route must be configured first.",
    );
  const p: ModulePermit = row.permit.modulePermit
    ? modulePermitSchema.parse(row.permit.modulePermit)
    : modulePermitSchema.parse({
        schemaVersion: "1",
        chainId: String(manifest.chainId),
        safe: manifest.safe,
        module: manifest.module,
        policyEpoch: epoch.toString(),
        engagementId,
        engagementVersion: String(input.engagement.version),
        obligationId,
        allocationId: keccak256(stringToHex(`allocation:${row.id}`)),
        paymentId: keccak256(stringToHex(row.id)),
        sourceChainId: String(manifest.chainId),
        destinationChainId: String(input.invoice.destination.chainId),
        recipient: input.invoice.destination.address,
        token: manifest.token,
        amount: eligibilityDecision.amount,
        maxFee: "0",
        route: cross ? CCTP_ROUTE : DIRECT_ROUTE,
        evidenceCommitment: businessEvidenceCommitment(input),
        expiresAt: String(
          Math.floor(Date.parse(eligibilityDecision.validUntil) / 1000),
        ),
        nonce: BigInt("0x" + randomBytes(32).toString("hex")).toString(),
        coverageId: input.policy.coverageRequired
          ? keccak256(stringToHex(`coverage:${row.id}`))
          : "0x" + "0".repeat(64),
        destinationDomain: cross ? process.env.CCTP_DESTINATION_DOMAIN : "0",
        minFinalityThreshold: cross ? "2000" : "0",
      });
  assertTestnetExecutionNetwork(p);
  if (
    p.amount !== eligibilityDecision.amount ||
    p.engagementVersion !== String(input.engagement.version) ||
    p.policyEpoch !== epoch.toString() ||
    p.evidenceCommitment !== businessEvidenceCommitment(input) ||
    p.recipient.toLowerCase() !==
      input.invoice.destination.address.toLowerCase() ||
    BigInt(p.expiresAt) <= BigInt(Math.floor(Date.now() / 1000)) ||
    Number(p.expiresAt) * 1000 > Date.parse(eligibilityDecision.validUntil)
  )
    throw new ServiceError(
      409,
      "PERMIT_STALE",
      "Unsigned permit terms changed or expired; prove expiry and release old coverage before replacing this operation.",
    );
  if (input.policy.coverageRequired) {
    const reserveAbi = parseAbi([
      "function reserve() view returns (address)",
      "function allocations(bytes32) view returns(address module,address beneficiary,bytes32 permitDigest,bytes32 paymentId,uint256 cap,uint64 permitExpiry,uint64 claimDeadline,uint8 state,bytes32 termsHash)",
    ]);
    const reserve = await client.readContract({
      address: manifest.module as Address,
      abi: reserveAbi,
      functionName: "reserve",
    });
    if (/^0x0+$/.test(reserve))
      throw new ServiceError(
        503,
        "COVERAGE_GATED",
        "This module has no configured reserve contract.",
      );
    const allocation = await client.readContract({
      address: reserve,
      abi: reserveAbi,
      functionName: "allocations",
      args: [p.coverageId as Hex],
    });
    if (allocation[7] === 0) {
      await db.query(
        "UPDATE payment_intents SET permit=$3,updated_at=now() WHERE id=$1 AND organization_id=$2",
        [
          row.id,
          actor.organizationId,
          JSON.stringify({
            ...row.permit,
            modulePermit: p,
            authorizedBy: actor.wallet,
          }),
        ],
      );
      return {
        id: row.id,
        state: "prepared",
        awaitingCoverage: true,
        reserve,
        coverageId: p.coverageId,
        permitDigest: permitDigest(p),
        paymentId: p.paymentId,
        beneficiary: p.safe,
        cap: p.amount,
        permitExpiry: p.expiresAt,
      };
    }
    if (
      allocation[7] !== 1 ||
      allocation[0].toLowerCase() !== p.module.toLowerCase() ||
      allocation[1].toLowerCase() !== p.safe.toLowerCase() ||
      allocation[2] !== permitDigest(p) ||
      allocation[3] !== p.paymentId ||
      allocation[4] < BigInt(p.amount) ||
      allocation[5] !== BigInt(p.expiresAt)
    )
      throw new ServiceError(
        409,
        "COVERAGE_BINDING",
        "Funded reserved allocation does not match this exact permit and full liability.",
      );
    const funded = await persistCoveredDecision(db, actor, result, {
      reserve,
      coverageId: p.coverageId,
      permitDigest: permitDigest(p),
    });
    result.id = funded.id;
    result.decision = funded.decision;
    result.input = funded.input;
  }
  await checkModuleDeployment({
    rpcUrl: rpc,
    permit: p,
    executor: manifest.circleWallet as Address,
  });
  assertCurrentDeploymentManifest(manifest);
  const signature = await signer.signTypedData({
    domain: {
      name: "Countersign",
      version: "1",
      chainId: BigInt(p.chainId),
      verifyingContract: p.module as Address,
    },
    primaryType: "PaymentPermit",
    types: permitTypedDataTypes,
    message: Object.fromEntries(
      permitFields.map(([name, type]) => [
        name,
        type.startsWith("uint") ? BigInt(p[name]) : p[name],
      ]),
    ) as Record<keyof ModulePermit, bigint | Hex>,
  });
  // Simulation checks all current contract caps and the actual signature without broadcasting.
  await client.simulateContract({
    address: p.module as Address,
    abi: moduleAbi,
    functionName: "execute",
    args: [
      Object.fromEntries(
        permitFields.map(([name, type]) => [
          name,
          type.startsWith("uint") ? BigInt(p[name]) : p[name],
        ]),
      ),
      signature,
    ],
    account: manifest.circleWallet as Address,
  } as never);
  assertCurrentDeploymentManifest(manifest);
  const bound = {
    ...row.permit,
    decisionId: result.id,
    invoiceVersion: result.decision.invoiceVersion,
    policyVersion: result.decision.policyVersion,
    engagementVersion: result.decision.engagementVersion,
    modulePermit: p,
    verifierSignature: signature,
    authorizedBy: actor.wallet,
  };
  await db.query(
    "UPDATE payment_intents SET state='authorized',permit=$3,updated_at=now() WHERE id=$1 AND organization_id=$2",
    [row.id, actor.organizationId, JSON.stringify(bound)],
  );
  await db.query(
    "INSERT INTO outbox(id,organization_id,kind,payload,dedupe_key) VALUES($1,$2,'payment.execute',$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",
    [
      randomUUID(),
      actor.organizationId,
      JSON.stringify({ paymentId: row.id }),
      `execute:${row.id}`,
    ],
  );
  await audit(db, actor, "payment.authorized", row.id, {
    permitDigest: permitDigest(p),
  });
  return { id: row.id, state: "authorized", permitDigest: permitDigest(p) };
}

export { businessEvidenceCommitment } from "../domain/evidence";
/** Invoke only after independently checking the exact active funded on-chain allocation. Retains the earlier conditional decision unchanged. */
export async function persistCoveredDecision(
  db: Database,
  actor: Actor,
  prior: Pick<
    Awaited<ReturnType<typeof evaluateInvoice>>,
    "id" | "decision" | "input"
  >,
  proof: { reserve: string; coverageId: string; permitDigest: string },
) {
  if (
    actor.role !== "owner" ||
    prior.input.tenantId !== actor.organizationId ||
    prior.decision.tenantId !== actor.organizationId
  )
    throw new ServiceError(
      403,
      "COVERAGE_DECISION_AUTHORITY",
      "Coverage decision must remain in the authenticated owner's organization.",
    );
  const blocking = prior.decision.findings.filter((f) => f.severity !== "info");
  if (
    !prior.input.policy.coverageRequired ||
    blocking.length !== 1 ||
    blocking[0].code !== "COVERAGE_REQUIRED"
  )
    throw new ServiceError(
      409,
      "COVERAGE_DECISION",
      "Only the independently resolved coverage condition can advance this decision.",
    );
  const input = { ...prior.input, coverageReserved: true };
  const decision = verifyObligation(input);
  if (!decision.executable || decision.action !== "PAY")
    throw new ServiceError(409, "PAYMENT_HELD", decision.reason);
  const id = randomUUID();
  await db.query(
    "INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'decision',$2,$3,$4)",
    [
      actor.organizationId,
      id,
      JSON.stringify({
        decision,
        input,
        obligationId: input.invoice.obligationId,
        priorDecisionId: prior.id,
        coverageProof: proof,
      }),
      actor.wallet,
    ],
  );
  return { id, decision, input };
}
