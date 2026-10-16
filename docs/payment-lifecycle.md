# A payment, end to end

Follow an illustrative 800 USDC monthly retainer from the agreement to the final record. Each step answers a different question. Passing one step does not silently satisfy the next.

## 1. What did you agree to pay?

The agreement names the vendor, obligation period, amount, currency, destination and acceptance requirement. An authorized owner approves the exact version. An invoice requests payment against that obligation; it does not create new terms.

Our example retainer is 800 USDC for one month and requires customer acceptance. USD and USDC remain distinct asset identities. A destination change needs a separate controlled review. Read [agreements and acceptance](/docs/agreements) and [vendor destinations](/docs/vendors).

## 2. Was the work accepted?

A delivery link or merged pull request can document activity. When the agreement requires acceptance, the named customer acceptor must attest to the exact obligation and terms.

Our invoice has a delivery link but no acceptance. Verification returns ASK for that missing approval. Ask the authorized acceptor; do not turn activity into approval. A material amendment or acceptance withdrawal requires a new review.

## 3. Do the current facts agree?

Verification checks the approved terms, versions, amount, destination, acceptance, policy and payment history supplied to it. Settled amounts and unresolved reservations consume capacity. A second file name does not make a duplicate obligation new.

After acceptance, a fresh review may return PAY if every current check passes. That means the supplied release checks pass. It does not grant permission to spend in Observe or Prepare mode, and is not settlement evidence. Decisions expire within five minutes or sooner when their inputs expire. Read [the exact checks and findings](/docs/verification).

## 4. Does the cash plan have room?

Eligibility and cash availability answer different questions. The plan considers confirmed balances, existing commitments, buffers and obligations across the shared Safe. An installment must respect explicit partial-payment terms.

If 300 USDC is settled and 200 USDC is reserved, only 300 USDC remains unallocated on an 800 USDC invoice. An uncertain operation retains its reservation until reconciled. A timeout does not create free capacity. Read [cash planning](/docs/planning).

## 5. Who authorizes the next step?

| Mode     | What the decision can lead to                    | What remains separate                                                         |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Observe  | An explanation and recorded findings             | All spending authority                                                        |
| Prepare  | An exact proposal for human review               | Transaction approval and execution                                            |
| Delegate | Bounded execution when all activation gates pass | Installed limits, current permits, reviewed controls and independent recovery |

The model organizes evidence and proposes a next step. It cannot authorize payment or expand policy. Application membership is not Safe ownership. Financial execution on the current public deployment is disabled. Read [security and permissions](/docs/security) and [release status](/docs/release-status).

## 6. What actually arrived?

A submitted operation keeps its original identity through retries and recovery. A source transaction hash is insufficient proof of destination settlement. Reconcile the exact asset, amount, approved recipient and matching destination effect before calling it settled.

If the outcome is unknown, investigate that original identity. A replacement can pay the same obligation twice. Independent recovery and on-chain revocation are separate from database holds. Read [payments](/docs/payments), [recovery](/docs/recovery) and [why settlement is not a hash](/docs/settlement-is-not-a-hash).

## 7. Can someone else follow the record?

A decision receipt connects source identities, versions, checks and the recorded outcome. Verify its integrity independently and export accounting periods with unresolved items disclosed. A matching hash proves integrity of supplied content, not the truth or completeness of an external event.

Read [receipts](/docs/receipts) and [accounting exports](/docs/accounting). Try the [five-case walkthrough](/review) to inspect synthetic traces from the production verifier. This page's teaching examples do not execute it.
