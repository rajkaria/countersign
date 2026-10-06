"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import {
  formatAmount,
  formatTime,
  humanize,
  type WorkspaceRecord,
  type WorkspacePayment,
} from "./format";
export function PaymentActivity({
  org,
  payments,
  invoices,
  role,
  onChange,
}: {
  org: string;
  payments: WorkspacePayment[];
  invoices: WorkspaceRecord[];
  role: string;
  onChange: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function inspect(id: string) {
    setError("");
    setLoading(true);
    setSelected(null);
    try {
      const r = await fetch(`/api/organizations/${org}/payments/${id}`);
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          body.error?.message ?? "Payment details could not be loaded.",
        );
      setSelected(body);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment details could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function attach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/organizations/${org}/payments/${selected.id}/relay-transaction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionHash: String(data.get("transactionHash")),
            note: String(data.get("note")),
          }),
        },
      );
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          body.error?.message ?? "The relay transaction could not be attached.",
        );
      await inspect(String(selected.id));
      await onChange();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The relay transaction could not be attached.",
      );
    } finally {
      setBusy(false);
    }
  }
  const permit = selected?.permit as Record<string, unknown> | undefined;
  return (
    <>
      <section className="live-panel">
        <div className="panel-heading">
          <h2>Payment activity</h2>
          <a
            href={`/api/organizations/${org}/export?format=csv`}
            className="button secondary"
          >
            <Download size={15} />
            Export accounting CSV
          </a>
        </div>
        <p className="small-muted">
          Prepared proposals, source transfers and destination settlement remain
          separate. Unknown operations retain their original identity and
          reserved capacity.
        </p>
        {payments.length ? (
          payments.map((p) => (
            <button
              className="live-record-row"
              key={p.id}
              onClick={() => inspect(p.id)}
            >
              <span>
                <strong>
                  {String(
                    invoices.find((i) => i.id === p.invoice_id)?.body
                      .reference ?? p.id.slice(0, 8),
                  )}
                </strong>
                <small>
                  {formatTime(p.created_at)} · {p.id.slice(0, 8)}
                </small>
              </span>
              <strong>{formatAmount(p.amount)}</strong>
              <span className="live-chip">{humanize(p.state)}</span>
            </button>
          ))
        ) : (
          <div className="live-empty compact">
            <h3>No payment proposals yet</h3>
            <p>
              Register an invoice and run verification. Prepare creates an exact
              proposal without submitting funds.
            </p>
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="live-alert error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading payment details…</p>}
      {selected && (
        <section className="live-panel">
          <div className="panel-heading">
            <h2>Payment {String(selected.id).slice(0, 8)}</h2>
            <button
              className="button secondary"
              onClick={() => setSelected(null)}
            >
              Close details
            </button>
          </div>
          <div className="console-context">
            <strong>{formatAmount(selected.amount)}</strong>
            <span className="live-chip">{humanize(selected.state)}</span>
          </div>
          <dl className="console-facts">
            {[
              "id",
              "idempotency_key",
              "invoice_id",
              "engagement_id",
              "source_tx",
              "destination_tx",
              "source_confirmed_at",
              "settled_at",
              "created_at",
              "updated_at",
              "invalidated_at",
              "invalidation_reason",
              "terminal_failure_proof",
            ]
              .filter((key) => selected[key] != null)
              .map((key) => (
                <div key={key}>
                  <dt>{humanize(key)}</dt>
                  <dd>
                    {key.endsWith("_at")
                      ? formatTime(selected[key])
                      : String(selected[key])}
                  </dd>
                </div>
              ))}
          </dl>
          {permit && (
            <>
              <h3>Exact proposal</h3>
              <dl className="console-facts">
                {[
                  "amount",
                  "destination",
                  "invoiceVersion",
                  "engagementVersion",
                  "policyId",
                  "policyVersion",
                  "obligationId",
                  "expiresAt",
                  "requiresCoverage",
                  "external",
                ]
                  .filter((key) => permit[key] != null)
                  .map((key) => (
                    <div key={key}>
                      <dt>{humanize(key)}</dt>
                      <dd>
                        {key === "amount"
                          ? formatAmount(permit[key])
                          : key === "expiresAt"
                            ? formatTime(permit[key])
                            : String(permit[key])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          )}
          <a
            className="button secondary"
            href={`/api/organizations/${org}/payments/${selected.id}/receipt`}
          >
            <Download size={15} />
            Download portable receipt
          </a>
          <p className="small-muted">
            The receipt describes the recorded state. Source confirmation alone
            does not prove receipt on the destination chain.
          </p>
          {["owner", "approver", "operator"].includes(role) &&
            ["destination_pending", "uncertain", "recovery_required"].includes(
              String(selected.state),
            ) && (
              <details className="console-related">
                <summary>Attach a destination relay transaction</summary>
                <form className="live-form" onSubmit={attach}>
                  <p>
                    Use the exact destination transaction for this operation.
                    The worker verifies it independently before marking
                    settlement.
                  </p>
                  <label>
                    Destination transaction hash
                    <input
                      name="transactionHash"
                      pattern="0x[0-9a-fA-F]{64}"
                      required
                    />
                  </label>
                  <label>
                    Recovery note and source
                    <textarea
                      name="note"
                      minLength={12}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    {busy ? "Attaching…" : "Attach for verification"}
                  </button>
                </form>
              </details>
            )}
        </section>
      )}
    </>
  );
}
