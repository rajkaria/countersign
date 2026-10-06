"use client";
import { useState } from "react";
import Link from "next/link";
import {
  formatAmount,
  formatTime,
  type WorkspaceRecord,
  type WorkspacePayment,
  type WorkspaceDocument,
} from "./format";
type Transfer = {
  transactionHash: string;
  logIndex: number;
  from: string;
  to: string;
  amount: string;
  block: string;
};
export function HistoryReconciliation({
  org,
  safe,
  observation,
  documents,
  invoices,
  payments,
  role,
  onChange,
}: {
  org: string;
  safe: WorkspaceRecord;
  observation: WorkspaceRecord;
  documents: WorkspaceDocument[];
  invoices: WorkspaceRecord[];
  payments: WorkspacePayment[];
  role: string;
  onChange: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const transfers = (
    Array.isArray(observation.body.transfers)
      ? (observation.body.transfers as Transfer[])
      : []
  ).filter(
    (t) =>
      String(t.from).toLowerCase() === String(safe.body.address).toLowerCase(),
  );
  const [classifications, setClassifications] = useState<
    Record<string, string>
  >({});
  async function reconcile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    const sourceDocumentIds = data.getAll("sourceDocumentIds").map(String);
    if (!sourceDocumentIds.length) {
      setError(
        "Select at least one original statement covering prior payment history.",
      );
      setBusy(false);
      return;
    }
    try {
      const result = await fetch(
        `/api/organizations/${org}/history-reconciliation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            safeId: safe.id,
            observationId: observation.id,
            sourceDocumentIds,
            statement: String(data.get("statement")),
            transfers: transfers.map((t, i) => ({
              transactionHash: t.transactionHash,
              logIndex: t.logIndex,
              classification: String(data.get(`classification-${i}`)),
              ...(data.get(`paymentId-${i}`)
                ? { paymentId: String(data.get(`paymentId-${i}`)) }
                : {}),
              ...(data.get(`invoiceId-${i}`)
                ? { invoiceId: String(data.get(`invoiceId-${i}`)) }
                : {}),
              reason: String(data.get(`reason-${i}`)),
            })),
          }),
        },
      );
      const body = await result.json();
      if (!result.ok)
        throw new Error(
          body.error?.message ?? "Reconciliation could not be recorded.",
        );
      setNotice(
        `Reconciliation recorded. ${body.createdPayments.length} external invoice settlements matched. ${body.limitation}`,
      );
      setOpen(false);
      await onChange();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reconciliation could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="console-history">
      <div className="panel-heading">
        <div>
          <h3>Finalized observation</h3>
          <p className="small-muted">
            {formatTime(observation.body.observedAt)} · blocks{" "}
            {String(observation.body.historyFrom)}–
            {String(observation.body.finalizedBlock)}
          </p>
        </div>
        <strong>{formatAmount(observation.body.balance)}</strong>
      </div>
      <dl className="console-facts">
        <div>
          <dt>Owners / threshold</dt>
          <dd>
            {Array.isArray(observation.body.owners)
              ? observation.body.owners.length
              : "Unavailable"}{" "}
            owners / {String(observation.body.threshold)}
          </dd>
        </div>
        <div>
          <dt>History status</dt>
          <dd>Bounded logs; earlier statements require reconciliation</dd>
        </div>
        <div>
          <dt>Finalized block hash</dt>
          <dd>
            <code>{String(observation.body.finalizedBlockHash)}</code>
          </dd>
        </div>
      </dl>
      {notice && (
        <p role="status" className="live-alert">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="live-alert error">
          {error}
        </p>
      )}
      {role === "owner" && (
        <button
          className="button secondary"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "Close reconciliation" : "Reconcile payment history"}
        </button>
      )}
      {open && (
        <form
          className="live-form console-reconciliation-form"
          onSubmit={reconcile}
        >
          <p>
            Upload statements covering prior history in Team & settings.
            Classify every observed outgoing transfer exactly once. This
            requires an owner sign-in from the last five minutes and a fresh
            observation. <Link href="/login">Reauthenticate</Link>
          </p>
          <fieldset>
            <legend>Supporting original statements</legend>
            {documents.length ? (
              documents.map((doc) => (
                <label className="check-label" key={doc.id}>
                  <input
                    type="checkbox"
                    name="sourceDocumentIds"
                    value={doc.id}
                  />
                  {doc.filename}
                </label>
              ))
            ) : (
              <p className="small-muted">
                Upload an original statement before reconciliation.
              </p>
            )}
          </fieldset>
          <label>
            Prior-history coverage and reconciliation statement
            <textarea
              name="statement"
              required
              minLength={30}
              maxLength={4000}
              placeholder="State the period covered by these originals and how earlier invoice settlements were matched."
            />
          </label>
          {transfers.length === 0 ? (
            <p>
              No outgoing transfers in this bounded observation. Supporting
              statements must still cover earlier history.
            </p>
          ) : (
            transfers.map((transfer, i) => (
              <fieldset
                key={`${transfer.transactionHash}:${transfer.logIndex}`}
              >
                <legend>
                  Outgoing transfer {i + 1} · {formatAmount(transfer.amount)}
                </legend>
                <p>
                  <code>{transfer.transactionHash}</code> · log{" "}
                  {transfer.logIndex}
                </p>
                <p>
                  Recipient <code>{transfer.to}</code> · block {transfer.block}
                </p>
                <label>
                  Classification
                  <select
                    name={`classification-${i}`}
                    required
                    value={classifications[i] ?? ""}
                    onChange={(e) =>
                      setClassifications({
                        ...classifications,
                        [i]: e.target.value,
                      })
                    }
                  >
                    <option value="">Choose classification</option>
                    <option value="countersign">
                      Existing Countersign payment
                    </option>
                    <option value="external_invoice">
                      Externally paid invoice
                    </option>
                    <option value="non_payable">Non-payable transfer</option>
                  </select>
                </label>
                {classifications[i] === "countersign" && (
                  <label>
                    Matching payment
                    <select required name={`paymentId-${i}`}>
                      <option value="">
                        Choose exact source transaction and amount
                      </option>
                      {payments
                        .filter(
                          (p) =>
                            p.source_tx?.toLowerCase() ===
                              transfer.transactionHash.toLowerCase() &&
                            p.amount === transfer.amount,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} · {p.state}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {classifications[i] === "external_invoice" && (
                  <label>
                    Externally settled invoice
                    <select required name={`invoiceId-${i}`}>
                      <option value="">Choose invoice</option>
                      {invoices
                        .filter(
                          (invoice) =>
                            String(invoice.body.destination).toLowerCase() ===
                            transfer.to.toLowerCase(),
                        )
                        .map((invoice) => (
                          <option key={invoice.id} value={invoice.id}>
                            {String(invoice.body.reference)} ·{" "}
                            {formatAmount(
                              invoice.body.amount,
                              invoice.body.currency,
                            )}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  Matching evidence / classification reason
                  <textarea
                    name={`reason-${i}`}
                    required
                    minLength={5}
                    maxLength={2000}
                  />
                </label>
              </fieldset>
            ))
          )}
          <button
            className="button primary"
            disabled={busy || !documents.length}
          >
            {busy
              ? "Recording reconciliation…"
              : "Record reviewed reconciliation"}
          </button>
        </form>
      )}
    </div>
  );
}
