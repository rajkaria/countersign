# Vendors and trusted destinations

A vendor record connects a business relationship to a reviewed settlement address and chain. It is the reference against which invoices are checked; an address printed on a new invoice is only a claim until reviewed.

## What you need

An owner creates the vendor with a name, an optional internal reference, an Ethereum-format destination, and a chain ID. Before marking it verified, record how the business identity and destination were independently confirmed. Use an established contact channel, not contact details supplied only in the change request. Wallet ownership alone does not establish business identity.

Vendor creation and editing require the workspace owner role. Being an approver, operator, or member of the business's Safe is a different form of authority. See [security](/docs/security).

## Register a vendor

1. Confirm the business relationship and the intended settlement chain.
2. Create the vendor record, initially unverified if confirmation is incomplete.
3. Add a verification note describing the independent confirmation. Do not include access credentials or unnecessary personal information.
4. Mark the vendor verified only after that confirmation.
5. Create an [agreement](/docs/agreements) for the vendor and link each invoice to that agreement.

A verified vendor still needs approved terms, sufficient available allocations, current history and any required acceptance. Verification is not a standing instruction to pay every invoice from that vendor.

## Change an address without changing history

An ordinary vendor edit cannot change the destination or chain. Use the separate destination-change workflow. It records the proposed destination, chain, reason, expected vendor version and proposing owner.

The owner proposing the change and the reviewer confirming it need sign-in sessions created within the previous five minutes. Normally a different eligible owner or approver confirms. A solo exception is available only if the database confirms there is one eligible reviewer; the reason is recorded, and confirmation needs a new sign-in session created after the proposal. A solo exception is never presented as two-person review.

After confirmation the trusted destination version advances. Prepared authority based on the old information is invalidated. An old invoice does not silently inherit a new destination approval: its recorded version must be reviewed and the discrepancy resolved. An application edit cannot revoke an already broadcast transaction or independently signed permit on chain; use the [recovery procedure](/docs/recovery) where necessary.

## Resolve a vendor discrepancy

Create a case for the affected invoice with the discrepancy, case owner and required evidence. Owners, approvers and operators can investigate within their roles. A case-scoped correction link allows the vendor to see only that case and propose a correction. Links expire after seven days.

The link token is carried in the URL fragment and used by the portal as a bearer credential. Treat the complete link as private. The vendor cannot browse the customer workspace, activate an agreement, approve acceptance, authorize a payment or overwrite the trusted destination.

Review submitted corrections against the original source and approved terms. A correction is new evidence; closing a case is not itself proof that payment is eligible. Run verification again.

## Example: an invoice requests a new address

A September retainer invoice matches the approved amount but lists a different wallet. Countersign reports a destination mismatch. Ask the established business contact to confirm the change, complete the authenticated destination review, and resolve the invoice's version binding before reevaluation. Do not copy the emailed address into a payment just because the amount looks routine.

## Related guides

Read [invoice intake](/docs/invoices), [verification findings](/docs/verification), and the [controlled-change API](/docs/api).
