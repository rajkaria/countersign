import { z } from "zod";

const reviewTarget = z
  .object({
    view: z.enum(["operations", "invoices", "history"]),
    invoiceId: z.uuid().optional(),
    caseId: z.uuid().optional(),
    paymentId: z.uuid().optional(),
  })
  .strict();
const validReview = (target: z.infer<typeof reviewTarget>) =>
  target.view === "operations"
    ? !target.invoiceId && !target.caseId && !target.paymentId
    : target.view === "invoices"
      ? Boolean(target.invoiceId) && !target.paymentId
      : Boolean(target.paymentId) && !target.caseId;
export const consoleReviewSchema = reviewTarget.refine(
  validReview,
  "Choose a valid invoice or payment review context",
);
export type ConsoleReview = z.infer<typeof consoleReviewSchema>;
export const noticeReviewsSchema = z
  .array(
    reviewTarget
      .extend({ label: z.string().min(1).max(120) })
      .refine(validReview, "Choose a valid invoice or payment review context"),
  )
  .max(3);

/** A navigation hint only. The authenticated console still validates membership and loaded records. */
export function consoleReviewHref(
  organizationId: string,
  target: ConsoleReview,
) {
  const org = z.uuid().parse(organizationId);
  const review = consoleReviewSchema.parse(target);
  const query = new URLSearchParams({ org, view: review.view });
  if (review.invoiceId) query.set("invoice", review.invoiceId);
  if (review.caseId) query.set("case", review.caseId);
  if (review.paymentId) query.set("payment", review.paymentId);
  return `/console?${query}`;
}
