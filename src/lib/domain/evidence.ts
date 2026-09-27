import { keccak256, stringToHex, type Hex } from "viem";
import { canonicalize } from "./receipt";
import type { VerificationInput } from "./types";

export function businessEvidenceCommitment(input: VerificationInput): Hex {
  return keccak256(
    stringToHex(
      canonicalize({
        invoiceId: input.invoice.id,
        invoiceVersion: input.invoice.version,
        engagementId: input.engagement.id,
        engagementVersion: input.engagement.version,
        policyId: input.policy.id,
        policyVersion: input.policy.version,
        sources: [
          input.engagement.source,
          input.invoice.source,
          ...[...input.acceptances]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((a) => a.source),
        ],
      }),
    ),
  );
}
