import { atomic, timestamp } from "./money";
export type ExecutionState =
  | "prepared"
  | "capacity_reserved"
  | "authorized"
  | "submitted"
  | "source_confirmed"
  | "destination_pending"
  | "settled"
  | "uncertain"
  | "failed"
  | "recovery_required";
export type Execution = Readonly<{
  paymentId: string;
  tenantId: string;
  state: ExecutionState;
  sourceChainId: number;
  destinationChainId: number;
  recipient: string;
  asset: string;
  amount: string;
  permitHash: string;
  attempt: number;
  updatedAt: string;
  providerRequestId?: string;
  sourceTransaction?: string;
  destinationTransaction?: string;
  failureReason?: string;
}>;
type At = { at: string };
export type ExecutionEvent = At &
  (
    | { type: "reserve" | "authorize" | "uncertain" | "recover" }
    | { type: "submitted"; providerRequestId: string }
    | { type: "source-confirmed"; transaction: string; finalized: boolean }
    | {
        type: "destination-confirmed";
        transaction: string;
        finalized: boolean;
        chainId: number;
        recipient: string;
        asset: string;
        amount: string;
      }
    | { type: "proven-failed"; proofReference: string }
    | { type: "retry-authorized"; proofReference: string }
  );
/** State reducer accepts authenticated provider/chain observations only. Persist operation and outbox before external submission. */
export function transitionExecution(
  current: Execution,
  event: ExecutionEvent,
): Execution {
  if (timestamp(event.at) < timestamp(current.updatedAt))
    throw new Error("Out-of-order execution event");
  atomic(current.amount);
  const allowed = (states: ExecutionState[]) => {
    if (!states.includes(current.state))
      throw new Error(`Invalid ${event.type} from ${current.state}`);
  };
  const next = { ...current, updatedAt: event.at };
  switch (event.type) {
    case "reserve":
      allowed(["prepared"]);
      return { ...next, state: "capacity_reserved" };
    case "authorize":
      allowed(["capacity_reserved"]);
      return { ...next, state: "authorized" };
    case "submitted":
      allowed(["authorized"]);
      if (!event.providerRequestId)
        throw new Error("Durable request identity required");
      if (
        current.providerRequestId &&
        current.providerRequestId !== event.providerRequestId
      )
        throw new Error("Provider request identity cannot change");
      return {
        ...next,
        state: "submitted",
        providerRequestId: event.providerRequestId,
        attempt: current.attempt + 1,
      };
    case "uncertain":
      allowed([
        "submitted",
        "source_confirmed",
        "destination_pending",
        "uncertain",
      ]);
      return { ...next, state: "uncertain" };
    case "recover":
      allowed(["uncertain", "failed", "destination_pending"]);
      return { ...next, state: "recovery_required" };
    case "source-confirmed":
      allowed([
        "submitted",
        "uncertain",
        "recovery_required",
        "destination_pending",
        "source_confirmed",
      ]);
      if (!event.finalized || !event.transaction)
        throw new Error("Finalized source transaction required");
      if (
        current.sourceTransaction &&
        current.sourceTransaction !== event.transaction
      )
        throw new Error("Conflicting source transaction");
      return {
        ...next,
        sourceTransaction: event.transaction,
        state:
          current.sourceChainId === current.destinationChainId
            ? "settled"
            : "destination_pending",
      };
    case "destination-confirmed":
      allowed(["destination_pending", "uncertain", "recovery_required"]);
      if (!current.sourceTransaction)
        throw new Error("Source must first be reconciled");
      if (
        !event.finalized ||
        !event.transaction ||
        event.chainId !== current.destinationChainId ||
        event.recipient.toLowerCase() !== current.recipient.toLowerCase() ||
        event.asset !== current.asset ||
        atomic(event.amount) !== atomic(current.amount)
      )
        throw new Error(
          "Destination settlement does not match authorized intent",
        );
      return {
        ...next,
        destinationTransaction: event.transaction,
        state: "settled",
      };
    case "proven-failed":
      allowed(["submitted", "uncertain", "recovery_required", "authorized"]);
      if (!event.proofReference || current.sourceTransaction)
        throw new Error(
          "Cannot release a source-confirmed or unproven operation",
        );
      return { ...next, state: "failed", failureReason: event.proofReference };
    case "retry-authorized":
      allowed(["failed"]);
      if (
        !event.proofReference ||
        !current.failureReason ||
        current.sourceTransaction
      )
        throw new Error("A retry requires terminal nonexecution evidence");
      return { ...next, state: "authorized" };
  }
}
