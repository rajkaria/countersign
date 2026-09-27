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
