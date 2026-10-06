import { useState, type ReactNode } from "react";
import { FileText, ExternalLink } from "lucide-react";
import {
  formatAmount,
  formatTime,
  humanize,
  sourceUrl,
  type WorkspaceRecord,
  type WorkspaceDocument,
  type WorkspacePayment,
} from "./format";

type Finding = {
  code: string;
  severity: string;
  message: string;
  sourceIds?: string[];
};
type Decision = {
  action?: string;
  reason?: string;
  nextCheck?: string;
  validUntil?: string;
  findings?: Finding[];
  amount?: string;
  executable?: boolean;
};
export function RecordInspector({
  record,
  records,
  documents,
  org,
  review,
  allocation,
  children,
  onClose,
  onSelect,
  canRevoke,
  onRevoke,
}: {
  record: WorkspaceRecord;
  records: WorkspaceRecord[];
  documents: WorkspaceDocument[];
  payments: WorkspacePayment[];
  org: string;
  allocation?: Record<string, string>;
  review?: { decision: Decision; balance?: Record<string, string> } | null;
  canRevoke: boolean;
  onRevoke: (record: WorkspaceRecord) => void;
  children: ReactNode;
  onClose: () => void;
  onSelect: (record: WorkspaceRecord) => void;
}) {
  const [now] = useState(() => Date.now());
  const isInvoice = record.kind === "invoice";
  const engagement = records.find(
    (r) => r.kind === "engagement" && r.id === record.body.engagementId,
  );
  const vendor = records.find(
    (r) => r.kind === "vendor" && r.id === record.body.vendorId,
  );
  const evidence = records.filter(
    (r) => r.kind === "evidence" && r.body.invoiceId === record.id,
  );
  const acceptances = records.filter(
    (r) => r.kind === "acceptance" && r.body.invoiceId === record.id,
  );
  const cases = records.filter(
    (r) => r.kind === "case" && r.body.invoiceId === record.id,
  );
  const savedDecision = records.find(
    (r) =>
      r.kind === "decision" &&
      (r.body.input as { invoice?: { id?: string } } | undefined)?.invoice
        ?.id === record.id,
  );
  const savedInput = savedDecision?.body.input as
    | { invoice?: { version?: number } }
    | undefined;
  const decision =
    review?.decision ?? (savedDecision?.body.decision as Decision | undefined);
  const staleDecision =
    !review && savedInput?.invoice?.version !== record.version;
  const balance = isInvoice ? (allocation ?? null) : null;
  const original = documents.find((doc) => doc.id === record.body.sourceId);
  const amountKeys = [
    "amount",
    "ceiling",
    "paidAmount",
    "hourlyRate",
    "minimumPartial",
  ];
  return (
    <section className="live-panel detail-panel" aria-label="Record details">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {humanize(record.kind)} · VERSION {record.version}
          </p>
          <h2>
            {String(
              record.body.reference ??
                record.body.title ??
                record.body.name ??
                "Workspace record",
            )}
          </h2>
        </div>
        <button className="button secondary" onClick={onClose}>
          Close details
        </button>
      </div>
      {isInvoice && (
        <div className="console-context">
          <span>
            Vendor:{" "}
            <strong>{String(vendor?.body.name ?? "Unavailable")}</strong>
          </span>
          <span>
            Agreement:{" "}
            {engagement ? (
              <button
                className="text-link"
                onClick={() => onSelect(engagement)}
              >
                {String(engagement.body.title)} · v
                {String(record.body.engagementVersion ?? "unbound")}
              </button>
            ) : (
              "Unavailable"
            )}
          </span>
        </div>
      )}
      {balance && (
        <div className="console-balance" aria-label="Invoice allocation">
          <div>
            <span>Invoiced</span>
            <strong>
              {formatAmount(balance.invoiced, record.body.currency)}
            </strong>
          </div>
          <div>
            <span>Settled</span>
            <strong>
              {formatAmount(balance.settled, record.body.currency)}
            </strong>
          </div>
          <div>
            <span>Reserved / uncertain</span>
            <strong>
              {formatAmount(balance.reserved, record.body.currency)}
            </strong>
          </div>
          <div>
            <span>Unallocated remainder</span>
            <strong>
              {formatAmount(balance.remaining, record.body.currency)}
            </strong>
          </div>
        </div>
      )}
      {isInvoice && !allocation && (
        <p className="small-muted">
          Loading exact invoice allocations. Preparation is available after the
          current authoritative remainder is loaded.
        </p>
      )}
      {isInvoice && decision && (
        <div className="console-review">
          <div className="panel-heading">
            <h3>
              Latest verification{staleDecision ? " · prior version" : ""}
            </h3>
            <span className="live-chip">{humanize(decision.action)}</span>
          </div>
          <p>{decision.reason}</p>
          {staleDecision && (
            <p className="console-version-note">
              This verification was recorded for an earlier invoice version. Run
              verification again for the current record.
            </p>
          )}
          <p className="small-muted">
            {decision.nextCheck}{" "}
            {decision.validUntil &&
              `Valid until ${formatTime(decision.validUntil)}.`}{" "}
            Reevaluate after changing terms, evidence or cash.
          </p>
          {decision.findings?.map((finding, i) => (
            <div
              className={`console-finding ${finding.severity === "info" ? "info" : "hold"}`}
              key={`${finding.code}:${i}`}
            >
              <strong>{humanize(finding.code)}</strong>
              <p>{finding.message}</p>
              {finding.sourceIds?.length ? (
                <small>Record sources: {finding.sourceIds.join(", ")}</small>
              ) : null}
            </div>
          ))}
          <p className="small-muted">
            PAY means the obligation passed the recorded checks. Submission
            needs separate verified authority.
          </p>
        </div>
      )}
      <dl className="console-facts">
        {Object.entries(record.body)
          .filter(
            ([key]) =>
              !["vendorId", "engagementId", "acceptors", "sourceId"].includes(
                key,
              ),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{humanize(key)}</dt>
              <dd>
                {amountKeys.includes(key)
                  ? formatAmount(value, record.body.currency)
                  : typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : Array.isArray(value)
                      ? value.join(", ")
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value ?? "—")}
              </dd>
            </div>
          ))}
        <div>
          <dt>Last change</dt>
          <dd>{formatTime(record.updated_at)}</dd>
        </div>
        <div>
          <dt>Original source</dt>
          <dd>
            {original ? (
              <a
                href={`/api/organizations/${org}/documents/${original.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={13} /> {original.filename}
              </a>
            ) : (
              "Manual entry; no uploaded original linked"
            )}
          </dd>
        </div>
      </dl>
      {children}
      {isInvoice && (
        <>
          <div className="console-related">
            <h3>Delivery acceptance</h3>
            {acceptances.length ? (
              acceptances.map((entry) => (
                <div key={entry.id} className="console-evidence">
                  <span className="live-chip">
                    {entry.body.revoked
                      ? "Revoked"
                      : Date.parse(String(entry.body.expiresAt)) < now
                        ? "Expired"
                        : "Recorded acceptance"}
                  </span>
                  <p>{String(entry.body.statement)}</p>
                  {Boolean(entry.body.revoked) && (
                    <p>{String(entry.body.revocationReason)}</p>
                  )}
                  <small>
                    Agreement v{String(entry.body.engagementVersion)} · accepted
                    by {String(entry.body.acceptedBy ?? "recorded actor")} ·
                    expires {formatTime(entry.body.expiresAt)}
                  </small>
                  {canRevoke && !entry.body.revoked && (
                    <button
                      className="button secondary"
                      onClick={() => onRevoke(entry)}
                    >
                      Revoke acceptance
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="small-muted">
                No customer acceptance is recorded for this invoice.
              </p>
            )}
          </div>
          <div className="console-related">
            <h3>Source evidence</h3>
            {evidence.length ? (
              evidence.map((entry) => (
                <div key={entry.id} className="console-evidence">
                  <span className="live-chip">{humanize(entry.body.kind)}</span>
                  <p>{String(entry.body.summary)}</p>
                  {sourceUrl(entry.body.source) ? (
                    <a
                      href={sourceUrl(entry.body.source)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source <ExternalLink size={13} />
                    </a>
                  ) : (
                    <code>{String(entry.body.source)}</code>
                  )}
                  <small>
                    Observed {formatTime(entry.body.observedAt)} · commitment{" "}
                    {String(entry.body.commitment)}
                  </small>
                </div>
              ))
            ) : (
              <p className="small-muted">
                No evidence attached. Activity evidence and delivery acceptance
                are separate.
              </p>
            )}
          </div>
          {cases.length > 0 && (
            <div className="console-related">
              <h3>Linked exceptions</h3>
              {cases.map((entry) => (
                <button
                  className="live-record-row"
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                >
                  <span>
                    <strong>{String(entry.body.title)}</strong>
                    <small>{String(entry.body.reason)}</small>
                  </span>
                  <span className="live-chip">
                    {humanize(entry.body.status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {record.kind === "case" && (
        <div className="console-related">
          <h3>Vendor correction proposals</h3>
          {records
            .filter(
              (r) =>
                r.kind === "vendor_correction" && r.body.caseId === record.id,
            )
            .map((correction) => (
              <div className="console-evidence" key={correction.id}>
                <span className="live-chip">Untrusted proposal</span>
                <p>{String(correction.body.correction)}</p>
                <small>{formatTime(correction.created_at)}</small>
              </div>
            ))}
          <p className="small-muted">
            Review each proposal against the original. Apply a versioned invoice
            correction or agreement amendment separately.
          </p>
        </div>
      )}
    </section>
  );
}
