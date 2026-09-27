# A decision you can take with you

The portable receipt captures the versioned decision, evidence commitments, exact permit binding and settlement references. Canonical serialization makes alterations detectable relative to the recorded digest. Optional signer verification must use an independently trusted signer address.

## Verify a downloaded receipt

```sh
npm ci
npm run receipt:verify -- path/to/receipt.json
```

The CLI returns a failure status when a receipt is malformed or its committed fields changed. The same domain library is used by application verification tests. JSON monetary values remain atomic-unit strings.

## What verification proves

- The serialized bound fields match the recorded commitment.
- The permit references the same organization, invoice, terms and policy versions.
- Settlement references fit the receipt's source/destination/recipient/asset/amount constraints.
- When a signature is supplied, it matches the explicitly trusted signing address.

## What it cannot prove offline

A hash does not prove the truth of an agreement, completeness of logging, chain finality or the quality of delivered work. A self-signed file is not an independent endorsement. Replacing both a receipt and an unanchored digest cannot be detected without an external trusted checkpoint. Public evidence commitments should be randomized; never publish low-entropy private invoice hashes as if they were anonymous.

## Redaction

Omit customer names, private source documents, comments, email and access tokens from public receipts unless the business explicitly consents. Keep a scoped internal mapping to the original evidence. Public judge examples remain synthetic until customer evidence has passed consent and redaction review.

## Download a payment receipt

In a signed-in workspace, open **Activity** and use the receipt download for the existing payment. Receipt access uses the same organization membership check as the payment: knowing another team's payment ID does not grant access. Viewers can export records they are allowed to inspect.

A download reconstructs a portable receipt from the payment's recorded decision version, its stored permit, and its recorded settlement ledger. It does not evaluate today's agreement as if those terms applied to an earlier payment. Inconsistent or incomplete bindings return a reconciliation error rather than a plausible-looking receipt.

- A prepared proposal can have no execution permit. This is a decision record, not proof that funds moved.
- An authorized or pending payment can include its complete execution permit and digest while keeping `settlement` null.
- Source confirmation alone on a cross-chain payment keeps `settlement` null. A settled export requires the stored destination transaction, the source confirmation record, the settlement timestamp, and a matching settlement ledger entry.
- A same-chain settled export uses its recorded source transaction. This does not create a new destination-chain event.

Receipts are historical records, not reusable payment instructions. A receipt does not establish that an old permit is still executable, that a currently paused policy is active, or that a previously authorized payment should be retried. Independent chain verification remains necessary.

## Fields included in a private-workspace export

The download includes opaque organization, invoice, engagement and payment identifiers; decision versions, actions and finding codes; exact atomic amounts, recipient and chain fields; and the full stored execution permit when one exists. The execution digest is recomputed from that stored permit. It does not imply that the receipt itself has an independently trusted signature or external anchor.

Free-form decision narratives, raw verification inputs, source documents, source URLs, customer names and verifier signatures are omitted. Narratives are explicitly replaced with redaction notices before computing the portable receipt hash. Consequently the portable receipt hash commits to the exported, redacted record; it is not a claim that the original internal JSON was published unchanged. Exported evidence commitments come from the stored execution permit. The exporter does not publish a new collection of unsalted document hashes.

Even a redacted receipt exposes financial metadata including amounts, wallet destinations and activity times. Downloading it is not consent to publish it. Review and obtain the business's permission before sharing it outside the organization.
