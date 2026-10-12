"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Settings, RefreshCw } from "lucide-react";
import type {
  ActivationReport,
  ActivationCheck,
} from "@/lib/server/activation";
import type { WorkspaceRecord } from "./format";
import "./setup.css";

const labels: Record<string, string> = {
  "database.configuration": "Dedicated database",
  "documents.key": "Document encryption",
  "auth.origin": "Sign-in origin",
  "database.schema": "Database migrations",
  "integration.model": "Document assistance",
  "integration.github": "GitHub evidence",
  "integration.notifications": "Reminders",
  "integration.forwarding": "Forwarded intake",
  "owner.restore": "Restore rehearsal",
  "owner.financial": "Financial activation",
  "execution.switch": "Payment execution",
  "manifest.configuration": "Deployment manifest",
};
function Status({ check }: { check: ActivationCheck }) {
  const status =
    check.status === "configured"
      ? "Configured · not verified"
      : check.status === "owner_action"
        ? "Owner action"
        : check.status.replaceAll("_", " ");
  return <span className={`setup-status ${check.status}`}>{status}</span>;
}
export function WorkspaceSetup({
  org,
  records,
  documents,
  onOpen,
}: {
  org: string;
  records: WorkspaceRecord[];
  documents: number;
  onOpen: (kind: string) => void;
}) {
  const [report, setReport] = useState<ActivationReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/organizations/${org}/activation`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message ?? "Setup status is unavailable.",
          );
        if (active) setReport(data);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Setup status is unavailable.",
          );
      });
    return () => {
      active = false;
    };
  }, [org]);
  async function probe() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizations/${org}/activation?probe=database`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ?? "The database check could not run.",
        );
      setReport(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The database check could not run.",
      );
    } finally {
      setBusy(false);
    }
  }
  const steps = [
    {
      title: "Register a vendor",
      kind: "vendor",
      done: records.some((r) => r.kind === "vendor"),
      detail:
        "Confirm identity and the intended destination before preparing payments.",
    },
    {
      title: "Record an agreement",
      kind: "engagement",
      done: records.some((r) => r.kind === "engagement"),
      detail: "Review exact rates, periods, limits and authorized acceptors.",
    },
    {
      title: "Keep the original",
      kind: "document",
      done: documents > 0,
      detail:
        "Store a consented original and attach its evidence to the record.",
    },
    {
      title: "Bring in an invoice",
      kind: "invoice",
      done: records.some((r) => r.kind === "invoice"),
      detail:
        "Verify it against the current terms, delivery and prior payment history.",
    },
  ];
  return (
    <div className="setup-desk">
      <section className="live-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">START IN OBSERVE</p>
            <h2>
              <Settings size={20} /> Workspace setup
            </h2>
          </div>
          <Link className="button secondary" href="/docs/activation">
            Setup guide
          </Link>
        </div>
        <p>
          Bring real records into review first. Payment delegation has its own
          reviewed deployment, recovery and funding requirements.
        </p>
        <ol className="setup-steps">
          {steps.map((step) => (
            <li key={step.kind}>
              <div>
                <span className="setup-step-state">
                  {step.done ? (
                    <>
                      <Check size={16} /> Record present
                    </>
                  ) : (
                    "Next action"
                  )}
                </span>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
              <button
                className="button secondary"
                onClick={() => onOpen(step.kind)}
              >
                {step.done ? "Add another" : step.title}
              </button>
            </li>
          ))}
        </ol>
        <p className="small-muted">
          Record presence does not certify approval, acceptance, customer
          consent or payment readiness.
        </p>
      </section>
      {error && (
        <p role="alert" className="live-alert error">
          {error}
        </p>
      )}
      {!report && !error && <p role="status">Loading redacted setup status…</p>}
      {report && (
        <>
          <section className="live-panel">
            <div className="panel-heading">
              <h2>Workspace infrastructure</h2>
              <button
                className="button secondary"
                disabled={busy}
                onClick={probe}
              >
                <RefreshCw size={16} />{" "}
                {busy ? "Checking…" : "Check database schema"}
              </button>
            </div>
            <p role="status">
              {report.databaseVerified
                ? "Database registry and expected security columns match this release."
                : report.workspaceConfigured
                  ? "Workspace credentials are configured. Database schema has not been verified here."
                  : "Workspace configuration is incomplete."}
            </p>
            <p className="small-muted">
              This check uses read-only database queries. It cannot send
              payments, notices or model requests. Restore and tenant isolation
              need their own rehearsal.
            </p>
            <CheckList
              checks={report.checks.filter(
                (c) =>
                  c.requiredFor === "workspace" || c.id === "owner.restore",
              )}
            />
          </section>
          <section className="live-panel">
            <h2>Optional integrations</h2>
            <p>
              Enable the providers useful to your pilot after approving cost,
              private-data handling and destinations.
            </p>
            <CheckList
              checks={report.checks.filter((c) =>
                c.id.startsWith("integration."),
              )}
            />
            <Link href="/docs/integrations">Integration instructions →</Link>
          </section>
          <section className="live-panel">
            <h2>Payment delegation</h2>
            <p className="setup-financial">
              Owner approval and external evidence required
            </p>
            <p>
              Technical configuration does not authorize funds or establish
              provider compatibility, independent review, protection reserves or
              customer consent.
            </p>
            <CheckList
              checks={report.checks.filter(
                (c) => c.requiredFor === "execution",
              )}
            />
            <Link href="/docs/payments">
              Payment and recovery requirements →
            </Link>
          </section>
          <p className="small-muted">
            Checked {new Date(report.checkedAt).toLocaleString()}. Refresh
            infrastructure status after changing configuration. Secrets stay in
            private host settings.
          </p>
        </>
      )}
    </div>
  );
}
function CheckList({ checks }: { checks: ActivationCheck[] }) {
  return (
    <ul className="setup-checks">
      {checks.map((check) => (
        <li key={check.id}>
          <div className="setup-check-heading">
            <strong>
              {labels[check.id] ?? check.id.replaceAll(".", " · ")}
            </strong>
            <Status check={check} />
          </div>
          <p>{check.detail}</p>
          {check.action && <p className="small-muted">Next: {check.action}</p>}
        </li>
      ))}
    </ul>
  );
}

export function UnconfiguredWorkspace({ onSignIn }: { onSignIn: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active) setConfigured(data.workspaceConfigured === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="live-panel setup-awaiting">
      <p className="eyebrow">PRIVATE WORKSPACE</p>
      <h1>
        {configured === false
          ? "Connect your workspace infrastructure"
          : "Sign in to your workspace"}
      </h1>
      <p>
        {configured === false
          ? "The public release is available. Real records need a dedicated database, document encryption key and configured sign-in origin before a private workspace can open."
          : "Authenticate your wallet to open authorized private records. Safe ownership and spending authority are verified separately."}
      </p>
      <div className="setup-actions">
        <Link href="/docs/activation" className="button primary">
          Owner setup steps
        </Link>
        <Link href="/workspace" className="button secondary">
          Explore the isolated demo
        </Link>
        {configured !== false && (
          <button className="button secondary" onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
      <p className="small-muted">
        Set credentials in private host settings. Keep payment execution
        disabled while verifying records, tenant access and restore.
      </p>
    </section>
  );
}
