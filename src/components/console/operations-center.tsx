"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Download,
  RefreshCw,
} from "lucide-react";
import type { operationsDesk } from "@/lib/server/operations";
import { demoOperations } from "@/lib/operations-demo";
import { consoleReviewHref } from "@/lib/console-review";
import { formatAmount } from "./format";
import "./operations.css";

type Desk = Awaited<ReturnType<typeof operationsDesk>>;
export function OperationsCenter({
  org = "",
  role = "viewer",
  onChange,
  demo = false,
}: {
  org?: string;
  role?: string;
  onChange?: () => void | Promise<void>;
  demo?: boolean;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("open");
  const [from, setFrom] = useState(
    new Date().toISOString().slice(0, 7) + "-01",
  );
  const [through, setThrough] = useState(new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<string | null>(null);
  const endpoint = `/api/organizations/${org}/operations`;
  const load = useCallback(async () => {
    setError("");
    if (demo) {
      setDesk(demoOperations());
      return;
    }
    if (!org) return;
    const r = await fetch(`/api/organizations/${org}/operations`);
    const value = await r.json();
    if (!r.ok)
      throw new Error(value.error?.message ?? "Could not load operations.");
    setDesk(value);
  }, [org, demo]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      try {
        if (demo) {
          if (active) setDesk(demoOperations());
          return;
        }
        if (!org) return;
        const r = await fetch(`/api/organizations/${org}/operations`);
        const value = await r.json();
        if (!r.ok)
          throw new Error(value.error?.message ?? "Could not load operations.");
        if (active) setDesk(value);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Could not load operations.",
          );
      }
    });
    return () => {
      active = false;
    };
  }, [org, demo]);
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(endpoint + path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok)
        throw new Error(value.error?.message ?? "Could not save operations.");
      await load();
      await onChange?.();
      setEditing(null);
      setNotice(
        "Saved. Payment eligibility still requires fresh verification.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save operations.");
    } finally {
      setBusy(false);
    }
  }
  if (!desk)
    return (
      <section className="ops-center">
        <p role={error ? "alert" : "status"}>
          {error || "Loading payment operations…"}
        </p>
        {error && (
          <button
            className="button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        )}
      </section>
    );
  const invoices = desk.invoices.filter(
    (i) =>
      filter === "all" ||
      (filter === "overdue"
        ? i.daysUntilDue < 0 && BigInt(i.outstanding) > 0n
        : filter === "allocated"
          ? BigInt(i.committed) > 0n
          : i.warnings.length > 0),
  );
  const preferences = desk.preferences.preferences;
  const activeCases = desk.cases.filter(
    (entry) => !["resolved", "reevaluated"].includes(String(entry.body.status)),
  );
  const visibleCases = caseFilter === "all" ? desk.cases : activeCases;
  const invoiceHref = (invoiceId: string, caseId?: string) =>
    demo
      ? `#ops-${caseId ? `case-${caseId}` : `invoice-${invoiceId}`}`
      : consoleReviewHref(org, {
          view: "invoices",
          invoiceId,
          ...(caseId ? { caseId } : {}),
        });
  const canEdit = demo || ["owner", "approver", "operator"].includes(role);
  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const preferences = {
      notificationsEnabled: f.get("notificationsEnabled") === "on",
      timezone: String(f.get("timezone")),
      quietHoursEnabled: f.get("quietHoursEnabled") === "on",
      quietStart: String(f.get("quietStart")),
      quietEnd: String(f.get("quietEnd")),
      reminderDays: Number(f.get("reminderDays")),
      escalationHours: Number(f.get("escalationHours")),
    };
    if (demo) {
      setDesk({
        ...desk!,
        preferences: { version: desk!.preferences.version + 1, preferences },
      });
      setNotice(
        "Sample preferences updated in this demo view. No notification was sent.",
      );
      return;
    }
    await mutate("/preferences", {
      expectedVersion: desk!.preferences.version,
      preferences,
    });
  }
  async function saveCase(
    event: React.FormEvent<HTMLFormElement>,
    entry: Desk["cases"][number],
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const due = String(f.get("dueAt"));
    const body = {
      expectedVersion: entry.version,
      owner: String(f.get("owner")),
      priority: String(f.get("priority")),
      status: String(f.get("status")),
      resolution: String(f.get("resolution")),
      ...(due ? { dueAt: new Date(`${due}Z`).toISOString() } : {}),
    };
    if (body.status === "resolved" && body.resolution.trim().length < 12) {
      setError(
        "Describe the evidence and resolution in at least 12 characters.",
      );
      return;
    }
    if (demo) {
      setDesk({
        ...desk!,
        cases: desk!.cases.map((c) =>
          c.id === entry.id
            ? {
                ...c,
                version: c.version + 1,
                body: { ...c.body, ...body },
                escalated: false,
              }
            : c,
        ),
        digest: {
          ...desk!.digest,
          notices:
            body.status === "resolved"
              ? desk!.digest.notices.filter((notice) => notice.id !== entry.id)
              : desk!.digest.notices,
        },
      });
      setEditing(null);
      setNotice(
        "Sample case updated. Resolving a case does not authorize payment.",
      );
      return;
    }
    await mutate(`/cases/${entry.id}`, body);
  }
  function sampleClose(format: "json" | "csv") {
    const rows = desk!.invoices;
    const body =
      format === "json"
        ? JSON.stringify(
            {
              cohort: "synthetic",
              period: { from, through },
              complete: false,
              warnings: [
                "Synthetic demo only. No real settlement or bookkeeper verification.",
              ],
              invoices: rows,
            },
            null,
            2,
          )
        : "cohort,reference,currency,outstanding_atomic,committed_atomic\r\n" +
          rows
            .map((r) =>
              [
                "synthetic",
                r.reference,
                r.currency,
                r.outstanding,
                r.committed,
              ].join(","),
            )
            .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([body], {
        type: format === "json" ? "application/json" : "text/csv",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `countersign-synthetic-close.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="ops-center" aria-label="Payment operations">
      <div className="ops-heading">
        <div>
          <p className="eyebrow">
            Weekly operating desk{demo ? " · synthetic" : ""}
          </p>
          <h2>Every obligation. A clear next step.</h2>
          <p className="small-muted">
            Due dates, reserved payments and unresolved work in one place.
            Figures derive from records and settlement, never editable paid
            labels.
          </p>
        </div>
        <button
          className="button"
          onClick={() => load().catch((e) => setError(e.message))}
        >
          <RefreshCw size={16} /> Refresh desk
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="ops-notice">
          {notice}
        </p>
      )}
      {desk.digest.notices.length > 0 && (
        <section className="ops-review" aria-label="Priority review queue">
          <div className="ops-toolbar">
            <h3>Start with these reviews</h3>
            <span className="small-muted">
              {desk.digest.notices.length} review items · {activeCases.length}{" "}
              open cases
            </span>
          </div>
          <p className="small-muted">
            Reconcile uncertain transfers first, then review exceptions and due
            obligations with their evidence.
          </p>
          <ol className="ops-review-list">
            {desk.digest.notices.slice(0, 3).map((entry) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <div>
                  <strong>{entry.kind.replaceAll("_", " ")}</strong>
                  <p>{entry.message}</p>
                </div>
                <Link
                  className="ops-action-link"
                  href={entry.href}
                  prefetch={false}
                >
                  {entry.actionLabel}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
      {BigInt(desk.summary.unattributedCommittedUSDC) > 0n && (
        <p role="status" className="ops-notice">
          Other retained commitments:{" "}
          {formatAmount(desk.summary.unattributedCommittedUSDC, "USDC")}.
          Restore or reconcile their source invoices before planning another
          payment.
        </p>
      )}
      {Object.entries(desk.summary.totals).map(([currency, totals]) => (
        <div key={currency}>
          <h3>{currency} obligations</h3>
          <div className="ops-stats">
            {(
              [
                ["Outstanding", totals.outstanding],
                ["Committed", totals.committed],
                ["Overdue", totals.overdue],
                ["Settled", totals.settled],
              ] as const
            ).map(([label, value]) => (
              <div className="ops-stat" key={label}>
                <span>{label}</span>
                <strong>{formatAmount(value, currency)}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!desk.invoices.length && (
        <div className="ops-empty">
          No invoices yet. Create a vendor and agreement, then import an invoice
          to start the desk.
        </div>
      )}
      <div className="ops-toolbar">
        <h3>
          <CalendarDays size={18} /> Payment calendar
        </h3>
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All obligations</option>
            <option value="overdue">Overdue</option>
            <option value="allocated">Committed payments</option>
            <option value="warnings">Needs reconciliation</option>
          </select>
        </label>
      </div>
      <p className="small-muted">{desk.summary.limitation}</p>
      <p className="ops-scroll-hint">
        Scroll the table sideways to see next actions.
      </p>
      <div className="ops-table-wrap">
        <table>
          <caption className="sr-only">
            Invoice due dates and allocation balances
          </caption>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Due</th>
              <th>Outstanding</th>
              <th>Committed</th>
              <th>Next action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && desk.invoices.length > 0 && (
              <tr>
                <td colSpan={5}>
                  No obligations match this filter. Choose All obligations to
                  return to the full calendar.
                </td>
              </tr>
            )}
            {invoices.map((invoice) => (
              <tr key={invoice.id} id={`ops-invoice-${invoice.id}`}>
                <td>
                  <strong>{invoice.reference}</strong>
                  <span>{formatAmount(invoice.amount, invoice.currency)}</span>
                </td>
                <td>
                  {invoice.dueDate}
                  <span>
                    {invoice.daysUntilDue < 0
                      ? `${-invoice.daysUntilDue} days overdue`
                      : invoice.daysUntilDue === 0
                        ? "Due today"
                        : `In ${invoice.daysUntilDue} days`}
                  </span>
                </td>
                <td>{formatAmount(invoice.outstanding, invoice.currency)}</td>
                <td>{formatAmount(invoice.committed, invoice.currency)}</td>
                <td>
                  {invoice.warnings.length ? (
                    <details>
                      <summary>
                        <AlertTriangle size={14} /> Review evidence
                      </summary>
                      {invoice.warnings.map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </details>
                  ) : BigInt(invoice.committed) > 0n ? (
                    "Reconcile existing operation"
                  ) : BigInt(invoice.outstanding) === 0n ? (
                    "Recorded settlement"
                  ) : (
                    "Verify terms and delivery"
                  )}
                  <Link
                    className="ops-action-link"
                    href={invoiceHref(invoice.id)}
                    prefetch={false}
                  >
                    Review invoice and evidence
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ops-toolbar">
        <h3>Exception owners & deadlines</h3>
        <label>
          Show cases{" "}
          <select
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
          >
            <option value="open">Open work</option>
            <option value="all">All including resolved</option>
          </select>
        </label>
      </div>
      <p className="small-muted">
        Assignment and resolution organize human work. They cannot attest
        delivery, clear a payment hold or grant authority.
      </p>
      <div className="ops-cases">
        {visibleCases.map((entry) => (
          <article
            className="ops-case"
            key={entry.id}
            id={`ops-case-${entry.id}`}
          >
            <div className="ops-toolbar">
              <h4>{String(entry.body.title)}</h4>
              <span
                className={entry.escalated ? "ops-escalated" : "small-muted"}
              >
                {entry.escalated
                  ? "Escalation due"
                  : String(entry.body.status).replaceAll("_", " ")}
              </span>
            </div>
            <p>{String(entry.body.reason)}</p>
            <p className="small-muted">
              Invoice:{" "}
              {desk.invoices.find(
                (invoice) => invoice.id === entry.body.invoiceId,
              )?.reference ?? String(entry.body.invoiceId)}
            </p>
            <p className="small-muted">
              Owner: {String(entry.body.owner || "Unassigned")} ·{" "}
              {String(entry.body.priority ?? "normal")} priority
            </p>
            {entry.body.dueAt ? (
              <p className="small-muted">
                Resolve by{" "}
                {String(entry.body.dueAt).slice(0, 16).replace("T", " ")} UTC
              </p>
            ) : null}
            <div className="ops-case-actions">
              <Link
                className="ops-action-link"
                href={invoiceHref(String(entry.body.invoiceId), entry.id)}
                prefetch={false}
              >
                Review exception and evidence
              </Link>
              {canEdit && (
                <button
                  className="button"
                  onClick={() =>
                    setEditing(editing === entry.id ? null : entry.id)
                  }
                >
                  {editing === entry.id ? "Cancel edit" : "Assign or resolve"}
                </button>
              )}
            </div>
            {editing === entry.id && (
              <form className="ops-form" onSubmit={(e) => saveCase(e, entry)}>
                <label>
                  Responsible person
                  <select
                    name="owner"
                    defaultValue={String(entry.body.owner)}
                    required
                  >
                    {desk.members
                      .filter((m) => m.role !== "viewer")
                      .map((m) => (
                        <option value={m.wallet} key={m.wallet}>
                          {m.wallet} · {m.role}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    defaultValue={String(entry.body.priority ?? "normal")}
                  >
                    <option>low</option>
                    <option>normal</option>
                    <option>high</option>
                    <option>urgent</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={String(
                      entry.body.status === "reevaluated"
                        ? "resolved"
                        : entry.body.status,
                    )}
                  >
                    <option value="open">Open / reopen</option>
                    <option value="awaiting_evidence">Awaiting evidence</option>
                    <option value="awaiting_approval">Awaiting approval</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label>
                  Resolve by (UTC)
                  <input
                    type="datetime-local"
                    step="1"
                    name="dueAt"
                    defaultValue={String(entry.body.dueAt ?? "").slice(0, 19)}
                  />
                </label>
                <label className="ops-full">
                  Resolution and evidence
                  <textarea
                    name="resolution"
                    defaultValue={String(entry.body.resolution ?? "")}
                    maxLength={2000}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving…" : "Save case"}
                </button>
              </form>
            )}
          </article>
        ))}
        {!visibleCases.length && (
          <p className="ops-empty">
            {caseFilter === "open"
              ? "No open exception work. Resolved cases remain available in All including resolved."
              : "No exception cases. Future discrepancies appear here once recorded."}
          </p>
        )}
      </div>
      <div className="ops-bottom">
        <section>
          <h3>
            <Bell size={18} /> Reminder preview
          </h3>
          <p className="small-muted">{desk.digest.note}</p>
          {desk.deliveries.some((d) => d.state !== "sent") && (
            <p role="status" className="ops-notice">
              A notice delivery is uncertain. Check the configured provider
              before any resend; its original event identity has been retained.
            </p>
          )}
          {desk.digest.notices.length ? (
            <ul className="ops-digest">
              {desk.digest.notices.slice(0, 20).map((n) => (
                <li key={`${n.kind}:${n.id}`}>
                  <strong>{n.kind.replaceAll("_", " ")}</strong>
                  <span>{n.message}</span>
                  <Link
                    className="ops-action-link"
                    href={n.href}
                    prefetch={false}
                  >
                    {n.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No actionable reminders.</p>
          )}
          {(role === "owner" || demo) && (
            <details>
              <summary>Notification & escalation preferences</summary>
              <form
                className="ops-form"
                key={desk.preferences.version}
                onSubmit={savePreferences}
              >
                <label className="check-label ops-full">
                  <input
                    type="checkbox"
                    name="notificationsEnabled"
                    defaultChecked={preferences.notificationsEnabled}
                  />{" "}
                  Enable workspace notifications{demo ? " (sample only)" : ""}
                </label>
                <label>
                  Timezone
                  <input
                    name="timezone"
                    defaultValue={preferences.timezone}
                    required
                  />
                </label>
                <label>
                  Remind before due (days)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    name="reminderDays"
                    defaultValue={preferences.reminderDays}
                    required
                  />
                </label>
                <label>
                  Escalate unresolved after (hours)
                  <input
                    type="number"
                    min={1}
                    max={720}
                    name="escalationHours"
                    defaultValue={preferences.escalationHours}
                    required
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="quietHoursEnabled"
                    defaultChecked={preferences.quietHoursEnabled}
                  />{" "}
                  Use quiet hours
                </label>
                <label>
                  Quiet hours begin
                  <input
                    type="time"
                    name="quietStart"
                    defaultValue={preferences.quietStart}
                    required
                  />
                </label>
                <label>
                  Quiet hours end
                  <input
                    type="time"
                    name="quietEnd"
                    defaultValue={preferences.quietEnd}
                    required
                  />
                </label>
                <button className="button" disabled={busy}>
                  Save preferences
                </button>
              </form>
            </details>
          )}
        </section>
        <section>
          <h3>
            <Download size={18} /> Accounting period pack
          </h3>
          <p>
            Export settled payments, unresolved operations and subledger
            evidence. An unresolved period is marked incomplete.
          </p>
          <div className="ops-form">
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
          </div>
          <div className="ops-toolbar">
            {(["json", "csv"] as const).map((format) =>
              demo ? (
                <button
                  className="button"
                  key={format}
                  onClick={() => sampleClose(format)}
                  disabled={!from || !through || from > through}
                >
                  Download {format.toUpperCase()}
                </button>
              ) : (
                <a
                  className="button"
                  key={format}
                  href={`${endpoint}/close?from=${encodeURIComponent(from)}&through=${encodeURIComponent(through)}&format=${format}`}
                >
                  Download {format.toUpperCase()}
                </a>
              ),
            )}
          </div>
          <p className="small-muted">
            {demo
              ? "Synthetic sample export. No actual transaction or customer evidence."
              : "Exports preserve records and include unresolved effects; verify with your bookkeeper."}
          </p>
        </section>
      </div>
    </section>
  );
}
