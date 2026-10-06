"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Plus,
  ShieldCheck,
  FileText,
  RefreshCw,
  Check,
  Wallet,
  Settings,
  Inbox,
  Clock,
  Activity,
} from "lucide-react";
import { OperationsCenter } from "@/components/console/operations-center";
import { HistoryReconciliation } from "@/components/console/history-reconciliation";
import { PaymentActivity } from "@/components/console/payment-activity";
import { WorkspaceAccess } from "@/components/console/workspace-access";
import { RecordInspector } from "@/components/console/record-inspector";
import {
  formatAmount as money,
  toAtomic as atomic,
  toDecimal as decimal,
  humanize,
  type WorkspaceRecord as RecordRow,
  type WorkspacePayment,
} from "@/components/console/format";
import "./console.css";
type Org = { id: string; name: string; role: string };
type Snapshot = {
  records: RecordRow[];
  events: {
    action: string;
    created_at: string;
    actor: string;
    entity_id?: string;
    details?: Record<string, unknown>;
  }[];
  payments: WorkspacePayment[];
  role: string;
  executionEnabled?: boolean;
};
const initial: Snapshot = {
  records: [],
  events: [],
  payments: [],
  role: "viewer",
};
type Review = {
  decision: {
    action: string;
    reason: string;
    findings: {
      code: string;
      severity: string;
      message: string;
      sourceIds: string[];
    }[];
    nextCheck?: string;
    validUntil?: string;
  };
  balance?: Record<string, string>;
};
const today = () => new Date().toISOString().slice(0, 10);
export default function Console() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const orgRef = useRef("");
  const requestGeneration = useRef(0);
  const operationBusy = useRef(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [snapshotOrg, setSnapshotOrg] = useState("");
  const [search, setSearch] = useState("");
  const [planPolicy, setPlanPolicy] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formBilling, setFormBilling] = useState("retainer");
  const [formCurrency, setFormCurrency] = useState("USDC");
  const [extractionKind, setExtractionKind] = useState("agreement");
  const [prepareKey, setPrepareKey] = useState("");
  const [policyExpiry] = useState(() => {
    const date = new Date(Date.now() + 30 * 86400000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [invoiceBalance, setInvoiceBalance] = useState<{
    invoiceId: string;
    invoiceVersion: number;
    data: Record<string, string>;
    overallocated: boolean;
  } | null>(null);
  const [review, setReview] = useState<{
    invoiceId: string;
    result: Review;
  } | null>(null);
  const [secret, setSecret] = useState<{
    title: string;
    value: string;
    description: string;
  } | null>(null);
  const [documents, setDocuments] = useState<
      { id: string; filename: string; mime: string }[]
    >([]),
    [forwarded, setForwarded] = useState<
      {
        external_id: string;
        body: { subject: string; sender: string; text: string };
      }[]
    >([]),
    [extraction, setExtraction] = useState<Record<string, unknown> | null>(
      null,
    );
  const [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(""),
    [wallet, setWallet] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot>(initial),
    [view, setView] = useState("overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState(""),
    [selected, setSelected] = useState<RecordRow | null>(null),
    [importPreview, setImportPreview] = useState<{
      rows: { row: number; status: string; message?: string }[];
    } | null>(null),
    [csvText, setCsvText] = useState(""),
    [changes, setChanges] = useState<
      {
        id: string;
        destination: string;
        reason: string;
        status: string;
        proposed_by: string;
      }[]
    >([]);
  useEffect(() => {
    if (form) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [form]);
  const call = useCallback(
    async (path: string, body?: unknown, method = "POST") => {
      const response = await fetch(
        path,
        body !== undefined
          ? {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" },
      );
      if (response.status === 204) return null;
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          data?.error?.message ??
            `Request failed (${response.status}). Refresh and try again.`,
        );
      return data;
    },
    [],
  );
  const load = useCallback(
    async (orgId: string) => {
      const generation = ++requestGeneration.current;
      const [snap, docs, intake] = await Promise.all([
        call(`/api/organizations/${orgId}/snapshot`),
        call(`/api/organizations/${orgId}/documents`),
        call(`/api/organizations/${orgId}/intake-events`),
      ]);
      if (orgRef.current !== orgId || generation !== requestGeneration.current)
        return;
      setSnapshot(snap);
      setDocuments(docs);
      setForwarded(intake);
      setSnapshotOrg(orgId);
      setSelected((current) =>
        current
          ? (snap.records.find(
              (r: RecordRow) => r.id === current.id && r.kind === current.kind,
            ) ?? null)
          : null,
      );
    },
    [call],
  );
  useEffect(() => {
    let active = true;
    call("/api/auth/me")
      .then((data) => {
        if (!active) return;
        setWallet(data.wallet);
        setOrgs(data.organizations);
        if (data.organizations[0]) setOrg(data.organizations[0].id);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [call]);
  useEffect(() => {
    orgRef.current = org;
    if (!org) return;
    let active = true;
    // Clear all workspace-scoped state before the next tenant request begins.
    const reset = async () => {
      setWorkspaceLoading(true);
      setSnapshot(initial);
      setSnapshotOrg("");
      setDocuments([]);
      setForwarded([]);
      setChanges([]);
      setSelected(null);
      setForm("");
      setExtraction(null);
      setReview(null);
      setSecret(null);
      setPlanPolicy("");
      setNotice("");
      setError("");
      try {
        await load(org);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Workspace data could not be loaded.",
          );
      } finally {
        if (active) setWorkspaceLoading(false);
      }
    };
    void reset();
    return () => {
      active = false;
      requestGeneration.current += 1;
    };
  }, [org, load]);
  useEffect(() => {
    if (
      !org ||
      view !== "settings" ||
      !["owner", "approver"].includes(snapshot.role)
    )
      return;
    let active = true;
    call(`/api/organizations/${org}/destination-changes`)
      .then((data) => {
        if (active) setChanges(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [org, view, snapshot.role, call]);
  useEffect(() => {
    if (!org || snapshotOrg !== org || selected?.kind !== "invoice") return;
    let active = true;
    call(`/api/organizations/${org}/invoices/${selected.id}/balance`)
      .then((data) => {
        if (!active) return;
        if (data.invoiceVersion !== selected.version) {
          setError(
            "Invoice changed while loading allocations. Refresh and review the current version.",
          );
          return;
        }
        setInvoiceBalance({
          invoiceId: selected.id,
          invoiceVersion: data.invoiceVersion,
          data: {
            invoiced: data.invoiced,
            settled: data.settled,
            reserved: data.reserved,
            remaining: data.remaining,
          },
          overallocated: data.overallocated,
        });
      })
      .catch((e) => {
        if (active)
          setError(
            `Exact invoice allocation could not be loaded. ${e.message}`,
          );
      });
    return () => {
      active = false;
    };
  }, [org, snapshotOrg, selected, call]);
  const items = (kind: string) =>
    snapshot.records.filter((r) => r.kind === kind);
  const vendors = items("vendor"),
    engagements = items("engagement"),
    invoices = items("invoice");
  const role = snapshot.role;
  const canOperate = ["owner", "approver", "operator"].includes(role);
  const canApprove = ["owner", "approver"].includes(role);
  const isOwner = role === "owner";
  const exactBalance =
    selected?.kind === "invoice" &&
    invoiceBalance?.invoiceId === selected.id &&
    invoiceBalance.invoiceVersion === selected.version
      ? invoiceBalance
      : null;
  const visibleRecords = items(view).filter(
    (r) =>
      (statusFilter === "all" ||
        String(r.body.status ?? r.body.mode ?? "recorded") === statusFilter) &&
      `${Object.values(r.body).join(" ")} ${r.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function openForm(kind: string, record: RecordRow | null = null) {
    setSelected(record);
    if (record?.kind !== "invoice" || record.id !== invoiceBalance?.invoiceId)
      setInvoiceBalance(null);
    setError("");
    setFormBilling(String(record?.body.billing ?? "retainer"));
    setFormCurrency(String(record?.body.currency ?? "USDC"));
    setImportPreview(null);
    if (kind === "prepare")
      setPrepareKey(
        `prepare:${record?.id}:v${record?.version}:${crypto.randomUUID()}`,
      );
    setForm(kind);
  }
  async function action(fn: () => Promise<void>) {
    if (operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (orgRef.current === org && org) await load(org);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const val = (name: string) => String(data.get(name) ?? "");
    await action(async () => {
      if (form === "organization") {
        const created = await call("/api/organizations", { name: val("name") });
        setOrgs([...orgs, created]);
        setOrg(created.id);
        setForm("");
        return;
      }
      if (form === "resolve") {
        if (!selected) throw new Error("Choose a case.");
        const response = await fetch(
          `/api/organizations/${org}/records/case/${selected.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedVersion: selected.version,
              body: {
                ...selected.body,
                status: "resolved",
                resolution: val("resolution"),
              },
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error.message);
        setSelected(null);
        setForm("");
        setNotice(
          "Resolution recorded. Reevaluate the invoice with current evidence before any payment.",
        );
        return;
      }
      if (form === "override") {
        if (!selected) throw new Error("Select an invoice.");
        const result = await call(`/api/organizations/${org}/override`, {
          invoiceId: selected.id,
          expectedVersion: selected.version,
          action: selected.body.manualHold ? "clear_hold" : "hold",
          reason: val("reason"),
        });
        setNotice(`${result.notice} ${result.coverageConsequence}`);
        setSelected(null);
        setForm("");
        return;
      }
      if (form === "destination") {
        if (!selected) throw new Error("Select the vendor.");
        await call(`/api/organizations/${org}/destination-changes`, {
          vendorId: selected.id,
          expectedVersion: selected.version,
          destination: val("destination"),
          chainId: Number(val("chainId")),
          reason: val("reason"),
          ...(val("soloExceptionReason")
            ? { soloExceptionReason: val("soloExceptionReason") }
            : {}),
        });
        setChanges(await call(`/api/organizations/${org}/destination-changes`));
        setForm("");
        setNotice(
          "Destination change proposed. Independent confirmation or a fresh solo reauthentication is still required.",
        );
        return;
      }
      if (form === "import") {
        const result = await call(`/api/organizations/${org}/import`, {
          csv: csvText,
          dryRun: !importPreview,
        });
        if (!importPreview) {
          setImportPreview(result);
          return;
        }
        setForm("");
        setImportPreview(null);
        setNotice("Invoices imported. Duplicate deliveries were skipped.");
        return;
      }
      if (form === "prepare") {
        if (!selected) throw new Error("Choose an invoice.");
        const requestedAmount = atomic(val("requestedAmount"), true);
        const result = await call(`/api/organizations/${org}/prepare`, {
          invoiceId: selected.id,
          key: prepareKey,
          requestedAmount,
        });
        setForm("");
        setNotice(
          `Payment ${result.id} is ${result.state}. Exact amount ${money(result.permit.amount)}. No funds were submitted.`,
        );
        return;
      }
      if (form === "revoke_acceptance") {
        if (!selected) throw new Error("Choose an acceptance.");
        await call(
          `/api/organizations/${org}/acceptances/${selected.id}/revoke`,
          { expectedVersion: selected.version, reason: val("reason") },
        );
        setForm("");
        setSelected(null);
        setNotice(
          "Acceptance revoked. Affected unsubmitted authority was invalidated; submitted operations still need reconciliation.",
        );
        return;
      }
      if (form === "github") {
        if (!selected) throw new Error("Choose an invoice.");
        await call(`/api/organizations/${org}/github-evidence`, {
          invoiceId: selected.id,
          owner: val("owner"),
          repo: val("repo"),
          number: Number(val("number")),
        });
        setForm("");
        setNotice(
          "GitHub activity evidence saved. It does not establish customer acceptance.",
        );
        return;
      }
      let body: Record<string, unknown> = {};
      let kind = form;
      if (form === "vendor")
        body = {
          name: val("name"),
          reference: val("reference"),
          destination: val("destination"),
          chainId: Number(val("chainId")),
          verified: data.get("verified") === "on",
          verificationNote: val("verificationNote"),
        };
      if (form === "engagement")
        body = {
          vendorId: val("vendorId") || selected?.body.vendorId,
          title: val("title"),
          billing: val("billing"),
          currency: val("currency"),
          ...(val("policyId") ? { policyId: val("policyId") } : {}),
          ...(val("billing") === "hourly"
            ? {
                hourlyRate: atomic(val("hourlyRate"), true),
                maximumQuantity: val("maximumQuantity"),
              }
            : {}),
          ...(val("minimumPartial")
            ? { minimumPartial: atomic(val("minimumPartial"), true) }
            : {}),
          acceptanceMaxAgeSeconds: Number(
            val("acceptanceMaxAgeSeconds") || 86400,
          ),
          amount: atomic(val("amount")),
          ceiling: atomic(val("ceiling")),
          effectiveFrom: val("effectiveFrom"),
          effectiveTo: val("effectiveTo"),
          acceptanceRequired: data.get("acceptanceRequired") === "on",
          acceptors: val("acceptors")
            .split(/[\s,]+/)
            .filter(Boolean),
          partialAllowed: data.get("partialAllowed") === "on",
          mode: val("mode"),
          approved: data.get("approved") === "on",
        };
      if (form === "invoice") {
        const engagement = engagements.find(
          (x) => x.id === (val("engagementId") || selected?.body.engagementId),
        );
        if (!engagement)
          throw new Error("Choose an approved engagement first.");
        const vendor = vendors.find((x) => x.id === engagement.body.vendorId);
        body = {
          vendorId: engagement.body.vendorId,
          engagementId: engagement.id,
          reference: val("reference"),
          amount: atomic(val("amount")),
          currency: val("currency"),
          ...(val("quantity") ? { quantity: val("quantity") } : {}),
          ...(selected?.kind === "invoice"
            ? {
                engagementVersion:
                  data.get("rebind") === "on"
                    ? engagement.version
                    : selected.body.engagementVersion,
              }
            : {}),
          periodStart: val("periodStart"),
          periodEnd: val("periodEnd"),
          dueDate: val("dueDate"),
          ...(selected?.kind === "invoice" &&
          data.get("rebindDestination") === "on"
            ? {
                destinationVersion: Number(
                  vendor?.body.destinationVersion ?? vendor?.version,
                ),
                destinationChainId: Number(vendor?.body.chainId),
              }
            : {}),
          destination:
            selected?.kind === "invoice" &&
            data.get("rebindDestination") === "on"
              ? vendor?.body.destination
              : val("destination") || vendor?.body.destination,
          description: val("description"),
        };
      }
      if (form === "safe")
        body = {
          name: val("name"),
          address: val("address"),
          chainId: Number(val("chainId")),
          mode: "observe",
        };
      if (form === "acceptance") {
        if (!selected) throw new Error("Choose an invoice.");
        const engagement = engagements.find(
          (x) => x.id === selected.body.engagementId,
        );
        body = {
          engagementId: selected.body.engagementId,
          invoiceId: selected.id,
          engagementVersion: engagement?.version,
          statement: val("statement"),
          expiresAt: new Date(
            Date.now() +
              Number(engagement?.body.acceptanceMaxAgeSeconds ?? 86400) * 1000,
          ).toISOString(),
        };
      }
      if (form === "case") {
        if (!selected) throw new Error("Choose an invoice.");
        body = {
          invoiceId: selected.id,
          vendorId: selected.body.vendorId,
          title: val("title"),
          reason: val("reason"),
          owner: wallet,
        };
      }
      if (form === "evidence") {
        if (!selected) throw new Error("Choose an invoice.");
        body = {
          invoiceId: selected.id,
          kind: "manual",
          summary: val("summary"),
          source: val("source"),
          observedAt: new Date().toISOString(),
          commitment: val("source"),
        };
      }
      if (form === "member") {
        await call(`/api/organizations/${org}/members`, {
          wallet: val("wallet"),
          role: val("role"),
        });
        setForm("");
        setNotice("Workspace member saved.");
        return;
      }
      if (form === "policy") {
        kind = "policy";
        body = {
          safeId: val("safeId"),
          perPayment: atomic(val("perPayment")),
          rolling24h: atomic(val("rolling24h")),
          totalAllocation: atomic(val("totalAllocation")),
          cashFloor: atomic(val("cashFloor")),
          protectedAmount: atomic(val("protectedAmount")),
          feeReserve: atomic(val("feeReserve")),
          paused: true,
          coveredOnly: true,
          expiresAt: new Date(val("expiresAt")).toISOString(),
        };
      }
      if (
        ["engagement", "invoice", "acceptance"].includes(kind) &&
        val("sourceId")
      )
        body.sourceId = val("sourceId");
      if (
        ["engagement", "invoice", "vendor"].includes(kind) &&
        selected?.kind === kind
      ) {
        const response = await fetch(
          `/api/organizations/${org}/records/${kind}/${selected.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body, expectedVersion: selected.version }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error.message);
        setSelected(null);
      } else await call(`/api/organizations/${org}/records/${kind}`, body);
      setForm("");
      setNotice(
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} saved to your private workspace.`,
      );
    });
  }
  const field = (
    name: string,
    label: string,
    type = "text",
    value = "",
    required = true,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        readOnly={
          (form === "invoice" &&
            selected?.kind === "invoice" &&
            ["periodStart", "periodEnd"].includes(name)) ||
          (form === "vendor" &&
            selected?.kind === "vendor" &&
            ["destination", "chainId"].includes(name))
        }
        step={type === "number" ? "1" : undefined}
        defaultValue={
          selected?.kind === form && selected.body[name] != null
            ? ["amount", "ceiling", "hourlyRate", "minimumPartial"].includes(
                name,
              )
              ? decimal(selected.body[name])
              : String(selected.body[name] ?? "")
            : value
        }
        maxLength={2000}
      />
    </label>
  );
  const choose = (
    name: string,
    label: string,
    rows: RecordRow[],
    title: string,
  ) => (
    <label>
      {label}
      <select
        name={name}
        required
        disabled={
          (form === "invoice" &&
            selected?.kind === "invoice" &&
            name === "engagementId") ||
          (form === "engagement" &&
            selected?.kind === "engagement" &&
            name === "vendorId")
        }
        onChange={(e) => {
          if (form === "invoice" && name === "engagementId" && !selected) {
            const agreement = engagements.find((r) => r.id === e.target.value);
            setFormCurrency(String(agreement?.body.currency ?? "USDC"));
          }
        }}
        defaultValue={
          form === selected?.kind ? String(selected.body[name] ?? "") : ""
        }
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {String(r.body[title])}
          </option>
        ))}
      </select>
    </label>
  );
  const nav = [
    ["overview", "Overview", Inbox],
    ["invoice", "Invoices", FileText],
    ["intake", "Forwarded intake", Inbox],
    ["engagement", "Agreements", Check],
    ["case", "Exceptions", Clock],
    ["plan", "Payment plan", Clock],
    ["activity", "Payments & receipts", RefreshCw],
    ["operations", "Operations", Activity],
    ["authority", "Authority", ShieldCheck],
    ["settings", "Team & settings", Settings],
  ] as const;
  return (
    <div className="live-shell">
      <aside className="live-sidebar">
        <Link href="/" className="wordmark">
          Countersign ↗
        </Link>
        <span className="live-label">
          <span />
          PRIVATE WORKSPACE
        </span>
        {orgs.length > 0 && (
          <label className="sr-only" htmlFor="organization">
            Organization
          </label>
        )}
        <select
          id="organization"
          aria-label="Organization"
          value={org}
          onChange={(e) => {
            setSelected(null);
            setForm("");
            setSecret(null);
            setReview(null);
            setSnapshotOrg("");
            setOrg(e.target.value);
          }}
          disabled={busy || loading}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => {
                setView(key);
                setSelected(null);
                setReview(null);
                setSearch("");
                setStatusFilter("all");
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/docs">
            Documentation <ArrowUpRight size={14} />
          </Link>
          <Link href="/workspace">
            Open isolated demo <ArrowUpRight size={14} />
          </Link>
          <button
            onClick={() =>
              action(async () => {
                await call("/api/auth/logout", {});
                router.push("/login");
                router.refresh();
              })
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="live-main">
        <header className="live-topbar">
          <span>Read-only first. Your Safe stays yours.</span>
          <span className="live-wallet">
            <Wallet size={14} />
            {wallet
              ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
              : "Not signed in"}
          </span>
        </header>
        <div className="live-content">
          {error && (
            <div role="alert" className="live-alert error">
              {error}
              {!wallet && <Link href="/login">Sign in →</Link>}
            </div>
          )}
          {notice && (
            <div role="status" className="live-alert">
              {notice}
            </div>
          )}
          {loading || workspaceLoading ? (
            <p>Opening your workspace…</p>
          ) : !org ? (
            <section className="live-empty">
              <p className="eyebrow">START WITH CLARITY</p>
              <h1>
                Your payment workspace,
                <br />
                without moving your treasury.
              </h1>
              <p>
                Create a workspace, register a vendor, and bring in an
                agreement. Nothing can move money during read-only onboarding.
              </p>
              <button
                disabled={!wallet}
                className="button primary"
                onClick={() => setForm("organization")}
              >
                Create workspace <Plus size={16} />
              </button>
            </section>
          ) : snapshotOrg !== org ? (
            <section className="live-panel">
              <h1>Workspace data is unavailable</h1>
              <p>
                Reconnect or refresh to load your private PostgreSQL records. No
                real records are substituted from the isolated demo.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => action(() => load(org))}
              >
                Retry workspace load
              </button>
            </section>
          ) : (
            <>
              <div className="live-page-title">
                <div>
                  <p className="eyebrow">
                    {orgs.find((o) => o.id === org)?.name}
                  </p>
                  <h1>{nav.find((n) => n[0] === view)?.[1]}</h1>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => action(() => load(org))}
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>
              <div className="console-live-status">
                <span className="live-chip">{role}</span>
                <span>Private workspace records</span>
                <span>
                  Execution{" "}
                  {snapshot.executionEnabled
                    ? "requires verified authority"
                    : "gated"}
                </span>
              </div>
              {view === "operations" && (
                <OperationsCenter
                  key={org}
                  org={org}
                  role={role}
                  onChange={async () => {
                    await load(org);
                  }}
                />
              )}
              {view === "overview" && (
                <>
                  <div className="live-stats">
                    <div>
                      <span>Open invoices</span>
                      <strong>
                        {
                          invoices.filter(
                            (i) =>
                              !["paid", "canceled"].includes(
                                String(i.body.status),
                              ),
                          ).length
                        }
                      </strong>
                      <small>Actual workspace records</small>
                    </div>
                    <div>
                      <span>Needs a decision</span>
                      <strong>
                        {
                          items("case").filter(
                            (c) => c.body.status !== "resolved",
                          ).length
                        }
                      </strong>
                      <small>Open exception cases</small>
                    </div>
                    <div>
                      <span>Settled payments</span>
                      <strong>
                        {
                          snapshot.payments.filter((p) => p.state === "settled")
                            .length
                        }
                      </strong>
                      <small>Confirmed settlement only</small>
                    </div>
                  </div>
                  <section className="live-panel">
                    <h2>A good place to start</h2>
                    <div className="onboarding-steps">
                      {[
                        [
                          "vendor",
                          "Register a vendor",
                          "Verify who you pay and their destination.",
                        ],
                        [
                          "engagement",
                          "Add an agreement",
                          "Capture approved rates, dates, and acceptance.",
                        ],
                        [
                          "invoice",
                          "Bring in an invoice",
                          "See what matches and what needs a decision.",
                        ],
                      ].map(([kind, title, description], i) => (
                        <button
                          key={kind}
                          disabled={
                            !canOperate ||
                            (kind === "engagement" && !canApprove) ||
                            (kind === "vendor" && !isOwner)
                          }
                          onClick={() => openForm(kind)}
                        >
                          <span>0{i + 1}</span>
                          <strong>{title}</strong>
                          <small>{description}</small>
                          <ArrowUpRight size={18} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="live-panel">
                    <h2>Recent activity</h2>
                    {snapshot.events.length ? (
                      snapshot.events.slice(0, 8).map((event, i) => (
                        <div key={i} className="live-row">
                          <span>
                            {event.action
                              .replaceAll(".", " ")
                              .replaceAll("_", " ")}
                          </span>
                          <time>
                            {new Date(event.created_at).toLocaleString()}
                          </time>
                        </div>
                      ))
                    ) : (
                      <p className="small-muted">
                        Your workspace history begins with your first record.
                        Every change records its actor and time.
                      </p>
                    )}
                  </section>
                </>
              )}
              {["invoice", "engagement", "case"].includes(view) && (
                <section className="live-panel">
                  <div className="panel-heading">
                    <h2>
                      {view === "invoice"
                        ? "Invoices"
                        : view === "engagement"
                          ? "Approved obligations"
                          : "Exception inbox"}
                    </h2>
                    {view === "invoice" && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setImportPreview(null);
                          openForm("import");
                        }}
                      >
                        Import CSV
                      </button>
                    )}
                    {view !== "case" && (
                      <button
                        className="button primary"
                        disabled={
                          !canOperate || (view === "engagement" && !canApprove)
                        }
                        onClick={() => openForm(view)}
                      >
                        <Plus size={15} />
                        Add {view === "engagement" ? "agreement" : "invoice"}
                      </button>
                    )}
                  </div>
                  <div className="console-filter">
                    <label>
                      Search records
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Reference, vendor ID or description"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        {[
                          ...new Set(
                            items(view).map((r) =>
                              String(
                                r.body.status ?? r.body.mode ?? "recorded",
                              ),
                            ),
                          ),
                        ].map((status) => (
                          <option value={status} key={status}>
                            {humanize(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!visibleRecords.length ? (
                    <div className="live-empty compact">
                      <FileText size={28} />
                      <h3>
                        {view === "case" ? "No open cases" : "No records yet"}
                      </h3>
                      <p>
                        {view === "case"
                          ? "Open a case from an invoice when evidence needs review."
                          : "Add your first record to start a source-linked payment review."}
                      </p>
                    </div>
                  ) : (
                    visibleRecords.map((r) => (
                      <button
                        className="live-record-row"
                        key={r.id}
                        aria-pressed={selected?.id === r.id}
                        onClick={() => {
                          setSelected(r);
                          setReview(null);
                        }}
                      >
                        <span>
                          <strong>
                            {String(r.body.title ?? r.body.reference)}
                          </strong>
                          <small>
                            {String(
                              r.body.description ??
                                r.body.billing ??
                                r.body.reason,
                            )}
                          </small>
                        </span>
                        <span>
                          {r.body.amount
                            ? money(r.body.amount, r.body.currency)
                            : String(r.body.status ?? "")}
                        </span>
                        <span className="live-chip">
                          {String(
                            r.body.status ?? r.body.mode ?? "recorded",
                          ).replaceAll("_", " ")}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))
                  )}
                </section>
              )}
              {view === "plan" && (
                <section className="live-panel">
                  <div className="panel-heading">
                    <h2>Confirmed cash. Clear commitments.</h2>
                    <button
                      className="button primary"
                      disabled={busy || !canOperate || !items("policy").length}
                      onClick={() =>
                        action(async () => {
                          const policyId = planPolicy || items("policy")[0]?.id;
                          if (!policyId)
                            throw new Error("Create an exact policy first.");
                          const result = await call(
                            `/api/organizations/${org}/plan`,
                            { policyId },
                          );
                          setNotice(
                            `Plan saved. Remaining confirmed cash ${money(result.remainingCash)}. Expected revenue is not spendable.`,
                          );
                        })
                      }
                    >
                      Recompute plan
                    </button>
                  </div>
                  <p>
                    Sync the selected policy’s Safe before planning. Operating
                    reserves, protected obligations and pending payments reduce
                    available cash. A plan recommends actions and does not
                    submit payments.
                  </p>
                  <div className="console-filter">
                    <label>
                      Policy and Safe
                      <select
                        value={planPolicy || items("policy")[0]?.id || ""}
                        onChange={(e) => setPlanPolicy(e.target.value)}
                      >
                        <option value="">Choose a policy</option>
                        {items("policy").map((policy) => (
                          <option key={policy.id} value={policy.id}>
                            {String(
                              items("safe").find(
                                (safe) => safe.id === policy.body.safeId,
                              )?.body.name ?? policy.id,
                            )}{" "}
                            · policy v{policy.version}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {items("payment_plan")
                    .filter(
                      (plan) =>
                        plan.body.policyId ===
                        (planPolicy || items("policy")[0]?.id),
                    )
                    .slice(0, 1)
                    .map((plan) => (
                      <div key={plan.id}>
                        <p className="small-muted">
                          Generated {String(plan.body.generatedAt)} · policy v
                          {String(plan.body.policyVersion)}. Refresh after cash,
                          terms or evidence changes.
                        </p>
                        <div className="console-balance">
                          <div>
                            <span>Remaining confirmed cash</span>
                            <strong>{money(plan.body.remainingCash)}</strong>
                          </div>
                          <div>
                            <span>Protected and pending reserve</span>
                            <strong>{money(plan.body.protectedTotal)}</strong>
                          </div>
                          <div>
                            <span>Reserve shortfall</span>
                            <strong>{money(plan.body.shortfall)}</strong>
                          </div>
                          <div>
                            <span>Expected inflows</span>
                            <strong>{money(plan.body.expectedInflows)}</strong>
                            <span>Never spendable in this plan</span>
                          </div>
                        </div>
                        {(Array.isArray(plan.body.items)
                          ? (plan.body.items as {
                              id: string;
                              amount: string;
                              action: string;
                              reason: string;
                              shortfall: string;
                              reserved: boolean;
                              executionAt: string;
                            }[])
                          : []
                        ).map((item) => (
                          <div className="live-row" key={item.id}>
                            <span>
                              <strong>
                                {String(
                                  invoices.find((i) => i.id === item.id)?.body
                                    .reference ?? item.id,
                                )}
                              </strong>
                              <small>
                                {item.reason} ·{" "}
                                {item.reserved
                                  ? "Capacity included in this plan"
                                  : "No capacity included"}{" "}
                                · earliest{" "}
                                {new Date(item.executionAt).toLocaleString()}
                              </small>
                              <small>Shortfall {money(item.shortfall)}</small>
                            </span>
                            <strong>{money(item.amount)}</strong>
                            <span className="live-chip">{item.action}</span>
                            <button
                              className="button secondary"
                              onClick={() => {
                                const invoice = invoices.find(
                                  (i) => i.id === item.id,
                                );
                                if (invoice) {
                                  setSelected(invoice);
                                  setReview(null);
                                }
                              }}
                            >
                              Review invoice
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  {!items("policy").length && (
                    <div className="live-empty compact">
                      <h3>Add a Safe and policy first</h3>
                      <p>
                        Import a Safe for observation, define a paused policy
                        preview and bind agreements to that policy in Authority.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => setView("authority")}
                      >
                        Open authority
                      </button>
                    </div>
                  )}
                  {items("policy").length > 0 &&
                    !items("payment_plan").some(
                      (plan) =>
                        plan.body.policyId ===
                        (planPolicy || items("policy")[0]?.id),
                    ) && (
                      <p className="small-muted">
                        No saved plan for this policy. Sync the Safe and
                        recompute to use its current finalized balance.
                      </p>
                    )}
                </section>
              )}
              {view === "intake" && (
                <section className="live-panel">
                  <div className="panel-heading">
                    <h2>Forwarded invoice intake</h2>
                    <button
                      className="button secondary"
                      disabled={busy || !isOwner}
                      onClick={() =>
                        action(async () => {
                          const result = await call(
                            `/api/organizations/${org}/intake-keys`,
                            { label: "Invoice forwarding" },
                          );
                          setSecret({
                            title: "One-time invoice forwarding key",
                            value: result.token,
                            description: `Configure your trusted forwarder to POST ${location.origin}${result.endpoint} with this bearer token. ${result.warning}`,
                          });
                          setNotice(
                            "Forwarding key created. Copy and store the one-time value below.",
                          );
                        })
                      }
                    >
                      Create forwarding key
                    </button>
                  </div>
                  <p>
                    Forwarded messages are untrusted source material. Review the
                    original and register an invoice against an approved
                    agreement.
                  </p>
                  {forwarded.length ? (
                    forwarded.map((item) => (
                      <details key={item.external_id}>
                        <summary>
                          {item.body.subject} · {item.body.sender}
                        </summary>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {item.body.text}
                        </p>
                        <button
                          className="button secondary"
                          disabled={!canOperate}
                          onClick={() => openForm("invoice")}
                        >
                          Create reviewed invoice
                        </button>
                      </details>
                    ))
                  ) : (
                    <p className="small-muted">
                      No forwarded invoices yet. Connect an authenticated email
                      provider webhook using a scoped intake key.
                    </p>
                  )}
                </section>
              )}
              {view === "activity" && (
                <PaymentActivity
                  key={org}
                  org={org}
                  payments={snapshot.payments}
                  invoices={invoices}
                  role={role}
                  onChange={async () => {
                    await load(org);
                  }}
                />
              )}
              {view === "authority" && (
                <>
                  <section className="live-panel">
                    <div className="panel-heading">
                      <h2>Connected Safes</h2>
                      <button
                        className="button primary"
                        disabled={!isOwner}
                        onClick={() => openForm("safe")}
                      >
                        Import read-only <Plus size={15} />
                      </button>
                    </div>
                    <p>
                      Connecting a Safe records observation settings. Safe
                      owners retain their existing threshold and recovery
                      authority.
                    </p>
                    {items("safe").length ? (
                      items("safe").map((safe) => {
                        const observation = items("chain_observation").find(
                          (record) => record.body.safeId === safe.id,
                        );
                        const reconciliation = items(
                          "history_reconciliation",
                        ).find(
                          (record) =>
                            record.body.observationId === observation?.id,
                        );
                        return (
                          <div key={safe.id}>
                            <div className="live-row">
                              <span>
                                <strong>{String(safe.body.name)}</strong>
                                <small>
                                  {String(safe.body.address)} · chain{" "}
                                  {String(safe.body.chainId)}
                                </small>
                              </span>
                              <span className="live-chip">Observe</span>
                              <button
                                className="button secondary"
                                disabled={busy || !canOperate}
                                onClick={() =>
                                  action(async () => {
                                    const result = await call(
                                      `/api/organizations/${org}/safe-sync`,
                                      { safeId: safe.id },
                                    );
                                    setNotice(
                                      `Observed finalized block ${result.finalizedBlock}. Bounded history starts at ${result.historyFrom}. Reconcile original statements before preparation.`,
                                    );
                                  })
                                }
                              >
                                Sync read-only
                              </button>
                            </div>
                            {observation ? (
                              <HistoryReconciliation
                                key={observation.id}
                                org={org}
                                safe={safe}
                                observation={observation}
                                documents={documents}
                                invoices={invoices}
                                payments={snapshot.payments}
                                role={role}
                                onChange={async () => {
                                  await load(org);
                                }}
                              />
                            ) : (
                              <p className="small-muted">
                                Not synchronized. Configure the verified chain
                                integration and sync to observe finalized
                                balances and bounded transfer history.
                              </p>
                            )}
                            {reconciliation && (
                              <p className="small-muted">
                                Owner reconciliation recorded{" "}
                                {new Date(
                                  String(reconciliation.body.attestedAt),
                                ).toLocaleString()}
                                . Coverage depends on its supporting originals
                                and exact transfer classifications.
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="small-muted">
                        No Safe imported. Start with read-only observation of
                        your existing treasury.
                      </p>
                    )}
                  </section>
                  <section className="live-panel">
                    <div className="panel-heading">
                      <h2>Permission previews</h2>
                      <button
                        className="button secondary"
                        disabled={!isOwner || !items("safe").length}
                        onClick={() => openForm("policy")}
                      >
                        Create paused policy
                      </button>
                    </div>
                    <p>
                      Define per-payment limits, cash reserves and expiry before
                      installing authority. New policies start paused. Bind each
                      agreement to the exact policy and Safe.
                    </p>
                    {items("policy").map((policy) => (
                      <button
                        key={policy.id}
                        className="live-record-row"
                        onClick={() => setSelected(policy)}
                      >
                        <span>
                          <strong>
                            {String(
                              items("safe").find(
                                (safe) => safe.id === policy.body.safeId,
                              )?.body.name ?? "Safe policy",
                            )}{" "}
                            · v{policy.version}
                          </strong>
                          <small>
                            Per payment {money(policy.body.perPayment)} ·
                            24-hour limit {money(policy.body.rolling24h)}
                          </small>
                          <small>
                            Expires{" "}
                            {policy.body.expiresAt
                              ? new Date(
                                  String(policy.body.expiresAt),
                                ).toLocaleString()
                              : "not set"}
                          </small>
                        </span>
                        <span className="live-chip">
                          {policy.body.paused
                            ? "Paused"
                            : "Active policy record"}
                        </span>
                      </button>
                    ))}
                  </section>
                  <section className="live-panel">
                    <h2>Reserved payment protection</h2>
                    <p>
                      Protection is available only when its exact terms, funded
                      reserve allocation and independent reviewer are verified.
                      Inspect deployment evidence and current allocations before
                      treating any payment as covered.
                    </p>
                    <Link className="text-link" href="/docs/protection">
                      Read activation requirements →
                    </Link>
                  </section>
                </>
              )}
              {view === "settings" && (
                <>
                  <section className="live-panel">
                    <div className="panel-heading">
                      <h2>Vendors</h2>
                      <button
                        className="button primary"
                        disabled={!isOwner}
                        onClick={() => openForm("vendor")}
                      >
                        Add vendor
                      </button>
                    </div>
                    {vendors.map((v) => (
                      <div key={v.id} className="live-row">
                        <span>
                          <strong>{String(v.body.name)}</strong>
                          <small>
                            {String(v.body.destination)} · chain{" "}
                            {String(v.body.chainId)} · v{v.version}
                          </small>
                        </span>
                        <button
                          className="button secondary"
                          disabled={!isOwner}
                          onClick={() => openForm("vendor", v)}
                        >
                          Review vendor record
                        </button>
                        <span>
                          {v.body.verified
                            ? "Identity confirmed"
                            : "Needs verification"}
                        </span>
                        <button
                          className="button secondary"
                          disabled={!isOwner}
                          onClick={() => {
                            openForm("destination", v);
                          }}
                        >
                          Propose destination change
                        </button>
                      </div>
                    ))}
                  </section>
                  {canApprove && (
                    <section className="live-panel">
                      <h2>Destination change review</h2>
                      {changes
                        .filter((c) => c.status === "pending")
                        .map((c) => (
                          <div className="live-row" key={c.id}>
                            <span>
                              <strong>{c.destination}</strong>
                              <small>{c.reason}</small>
                            </span>
                            <button
                              disabled={busy}
                              className="button secondary"
                              onClick={() =>
                                action(async () => {
                                  await call(
                                    `/api/organizations/${org}/destination-changes/confirm`,
                                    { changeId: c.id },
                                  );
                                  setChanges(
                                    await call(
                                      `/api/organizations/${org}/destination-changes`,
                                    ),
                                  );
                                  setNotice(
                                    "Destination change confirmed; earlier unsubmitted authority was invalidated.",
                                  );
                                })
                              }
                            >
                              Confirm reviewed change
                            </button>
                          </div>
                        ))}
                      <p className="small-muted">
                        High-risk changes require a sign-in from the last five
                        minutes and an independent reviewer. Solo exceptions
                        need a separate new sign-in after the proposal.
                      </p>
                      <Link className="text-link" href="/login">
                        Reauthenticate →
                      </Link>
                    </section>
                  )}
                  <WorkspaceAccess
                    key={org}
                    org={org}
                    role={role}
                    onAddMember={() => openForm("member")}
                  />
                  <section className="live-panel">
                    <h2>Private documents</h2>
                    <label>
                      Extract fields from
                      <select
                        value={extractionKind}
                        onChange={(event) =>
                          setExtractionKind(event.target.value)
                        }
                      >
                        <option value="agreement">Agreement</option>
                        <option value="invoice">Invoice</option>
                      </select>
                    </label>
                    <p>
                      Encrypted at rest; access remains restricted to this
                      workspace. PDF, PNG, JPEG, CSV or text, up to 4 MB.
                    </p>
                    <label className="button secondary">
                      Upload original
                      <input
                        className="sr-only"
                        type="file"
                        disabled={!canOperate || busy}
                        accept="application/pdf,image/png,image/jpeg,text/csv,text/plain"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && file.size > 4 * 1024 * 1024) {
                            setError("Upload an original smaller than 4 MB.");
                            e.target.value = "";
                            return;
                          }
                          if (file)
                            action(async () => {
                              const data = new FormData();
                              data.append("file", file);
                              const r = await fetch(
                                `/api/organizations/${org}/documents`,
                                { method: "POST", body: data },
                              );
                              const result = await r.json();
                              if (!r.ok) throw new Error(result.error.message);
                              setNotice(
                                `Stored ${result.filename}. Document reference: ${result.id}`,
                              );
                            });
                        }}
                      />
                    </label>
                    {documents.map((doc) => (
                      <div className="live-row" key={doc.id}>
                        <a
                          href={`/api/organizations/${org}/documents/${doc.id}`}
                        >
                          {doc.filename}
                        </a>
                        <button
                          className="button secondary"
                          disabled={busy || !canOperate}
                          onClick={() =>
                            action(async () => {
                              const result = await call(
                                `/api/organizations/${org}/extract`,
                                { documentId: doc.id, kind: extractionKind },
                              );
                              setExtraction(result);
                              setNotice(
                                "Unapproved suggestions only. Review the original before entering or activating terms.",
                              );
                            })
                          }
                        >
                          Extract suggestions
                        </button>
                      </div>
                    ))}
                    {extraction && (
                      <div role="status">
                        <h3>Review against the original</h3>
                        {Object.entries(
                          (extraction.suggestion ?? extraction) as Record<
                            string,
                            unknown
                          >,
                        ).map(([key, value]) => (
                          <p key={key}>
                            <strong>{key.replace(/([A-Z])/g, " $1")}: </strong>
                            {Array.isArray(value)
                              ? value.join("; ")
                              : String(value ?? "Not found")}
                          </p>
                        ))}
                        {extraction.provenance != null && (
                          <details>
                            <summary>Source and extraction provenance</summary>
                            <pre>
                              {JSON.stringify(extraction.provenance, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {secret && (
            <section
              className="console-secret"
              aria-label="One-time private access"
            >
              <h3>{secret.title}</h3>
              <p>{secret.description}</p>
              <label>
                <span className="sr-only">Private access value</span>
                <input
                  value={secret.value}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <div className="action-row">
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(secret.value);
                      setNotice(
                        "Copied. Store this private access value securely.",
                      );
                    } catch {
                      setError(
                        "Clipboard is unavailable. Select and copy the value above.",
                      );
                    }
                  }}
                >
                  Copy private value
                </button>
                <button
                  className="button secondary"
                  onClick={() => setSecret(null)}
                >
                  Dismiss private value
                </button>
              </div>
            </section>
          )}
          {selected && !form && snapshotOrg === org && (
            <RecordInspector
              record={selected}
              records={snapshot.records}
              documents={documents}
              payments={snapshot.payments}
              org={org}
              review={review?.invoiceId === selected.id ? review.result : null}
              onClose={() => setSelected(null)}
              onSelect={(record) => {
                setSelected(record);
                setReview(null);
              }}
              canRevoke={canApprove}
              onRevoke={(record) => openForm("revoke_acceptance", record)}
            >
              {selected.kind === "invoice" && (
                <div className="action-row">
                  <button
                    disabled={busy || !canOperate}
                    className="button primary"
                    onClick={() =>
                      action(async () => {
                        const data = await call(
                          `/api/organizations/${org}/review`,
                          { invoiceId: selected.id },
                        );
                        setReview({ invoiceId: selected.id, result: data });
                        setNotice(
                          `${data.decision.action}: ${data.decision.reason}`,
                        );
                      })
                    }
                  >
                    Run verification
                  </button>
                  <button
                    disabled={busy || !canOperate}
                    className="button secondary"
                    onClick={() =>
                      action(async () => {
                        const result = await call(
                          `/api/organizations/${org}/agent-review`,
                          { invoiceId: selected.id },
                        );
                        setNotice(
                          `${result.proposal.action}: ${result.proposal.reason}`,
                        );
                      })
                    }
                  >
                    Ask evidence assistant
                  </button>
                  <button
                    disabled={
                      busy ||
                      !canOperate ||
                      !exactBalance ||
                      exactBalance.overallocated
                    }
                    className="button secondary"
                    onClick={() => openForm("prepare", selected)}
                  >
                    Prepare exact amount
                  </button>
                  <button
                    disabled={busy || !canApprove}
                    className="button secondary"
                    onClick={() => openForm("invoice", selected)}
                  >
                    Create invoice correction
                  </button>
                  <button
                    className="button secondary"
                    disabled={!canApprove}
                    onClick={() => openForm("acceptance", selected)}
                  >
                    Confirm acceptance
                  </button>
                  <button
                    className="button secondary"
                    disabled={!isOwner}
                    onClick={() => openForm("override", selected)}
                  >
                    {selected.body.manualHold
                      ? "Clear manual hold"
                      : "Hold this invoice"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={!canOperate}
                    onClick={() => openForm("case", selected)}
                  >
                    Open a case
                  </button>
                  <button
                    className="button secondary"
                    disabled={!canOperate}
                    onClick={() => openForm("evidence", selected)}
                  >
                    Add evidence
                  </button>
                  <button
                    className="button secondary"
                    disabled={!canOperate}
                    onClick={() => openForm("github", selected)}
                  >
                    Link GitHub evidence
                  </button>
                </div>
              )}
              {selected.kind === "engagement" && (
                <button
                  className="button secondary"
                  disabled={!canApprove}
                  onClick={() => openForm("engagement", selected)}
                >
                  Create reviewed amendment
                </button>
              )}
              {selected.kind === "case" && (
                <button
                  className="button secondary"
                  disabled={!canOperate}
                  onClick={() => openForm("resolve", selected)}
                >
                  Record case resolution
                </button>
              )}
              {selected.kind === "case" && (
                <button
                  className="button secondary"
                  disabled={busy || !canApprove}
                  onClick={() =>
                    action(async () => {
                      const result = await call(
                        `/api/organizations/${org}/vendor-links`,
                        { caseId: selected.id },
                      );
                      setSecret({
                        title: "Private vendor correction link",
                        value: `${location.origin}${result.path}`,
                        description:
                          "Shown in this session only. Expires in 7 days. Share with the intended vendor; it can submit correction proposals for this case and cannot change terms or destinations.",
                      });
                      setNotice(
                        "Private correction link created. Copy the value below.",
                      );
                    })
                  }
                >
                  Create private correction link
                </button>
              )}
            </RecordInspector>
          )}
        </div>
      </main>
      {form && (
        <dialog
          ref={dialogRef}
          onCancel={(e) => {
            if (busy) {
              e.preventDefault();
              return;
            }
            setForm("");
          }}
          aria-labelledby="form-title"
          className="live-modal"
        >
          <div className="panel-heading">
            <h2 id="form-title">
              {form === "organization"
                ? "Create workspace"
                : form === "acceptance"
                  ? "Confirm delivery acceptance"
                  : form === "revoke_acceptance"
                    ? "Revoke delivery acceptance"
                    : form === "prepare"
                      ? "Prepare an exact payment proposal"
                      : form === "github"
                        ? "Link GitHub evidence"
                        : selected?.kind === form
                          ? `Review ${form === "engagement" ? "agreement amendment" : "invoice correction"}`
                          : `Add ${form === "engagement" ? "agreement" : form}`}
            </h2>
            <button
              aria-label="Close form"
              className="button secondary"
              disabled={busy}
              onClick={() => setForm("")}
            >
              ×
            </button>
          </div>
          <form onSubmit={submit} className="live-form">
            {form === "organization" && field("name", "Workspace name")}
            {form === "revoke_acceptance" && (
              <>
                <p>
                  Withdraw this acceptance with a recorded reason. This
                  invalidates affected unsubmitted payment authority; any
                  broadcast still requires independent reconciliation.
                </p>
                <label>
                  Withdrawal reason and evidence
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </label>
              </>
            )}
            {form === "import" && (
              <>
                <p>
                  Columns: engagement_id, reference, amount_usdc, period_start,
                  period_end, due_date, description. First validate, then
                  explicitly import.
                </p>
                <label>
                  CSV invoice data
                  <textarea
                    name="csv"
                    required
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      setImportPreview(null);
                    }}
                  />
                </label>
                {importPreview && (
                  <div role="status">
                    {importPreview.rows.map((row) => (
                      <p key={row.row}>
                        Row {row.row}: {row.status} {row.message ?? ""}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
            {form === "vendor" && (
              <>
                {field("name", "Vendor name")}
                <label>
                  Internal reference
                  <input
                    name="reference"
                    defaultValue={String(
                      selected?.kind === "vendor"
                        ? (selected.body.reference ?? "")
                        : "",
                    )}
                  />
                </label>
                {field("destination", "Verified settlement address")}
                {field("chainId", "Chain ID", "number", "5042002")}
                <label className="check-label">
                  <input
                    name="verified"
                    type="checkbox"
                    defaultChecked={Boolean(
                      selected?.kind === "vendor" && selected.body.verified,
                    )}
                  />
                  I verified this vendor and destination through an established
                  contact.
                </label>
                <label>
                  Verification note
                  <textarea
                    name="verificationNote"
                    defaultValue={String(
                      selected?.kind === "vendor"
                        ? (selected.body.verificationNote ?? "")
                        : "",
                    )}
                  />
                </label>
              </>
            )}
            {form === "engagement" && (
              <>
                {selected?.kind === "engagement" && (
                  <p className="console-version-note">
                    Amending version {selected.version}. Re-review these exact
                    terms; affected acceptance and unsubmitted payment authority
                    will be invalidated.
                  </p>
                )}
                {selected?.kind === "engagement" && (
                  <input
                    type="hidden"
                    name="vendorId"
                    value={String(selected.body.vendorId)}
                  />
                )}
                {choose("vendorId", "Vendor", vendors, "name")}
                {field("title", "Agreement title")}
                <label>
                  Billing model
                  <select
                    name="billing"
                    value={formBilling}
                    onChange={(e) => setFormBilling(e.target.value)}
                  >
                    <option value="retainer">Recurring retainer</option>
                    <option value="milestone">Milestone</option>
                    <option value="hourly">
                      Hourly — exact rate × quantity
                    </option>
                  </select>
                </label>
                <label>
                  Agreement currency
                  <select
                    name="currency"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                  >
                    <option value="USDC">USDC</option>
                    <option value="USD">
                      USD — requires explicit currency settlement agreement
                    </option>
                  </select>
                </label>
                {field(
                  "amount",
                  formBilling === "hourly"
                    ? `Obligation amount / ceiling (${formCurrency})`
                    : `Amount per obligation (${formCurrency})`,
                )}
                {formBilling === "hourly" && (
                  <>
                    {field(
                      "hourlyRate",
                      `Rate per whole hour (${formCurrency})`,
                    )}
                    {field(
                      "maximumQuantity",
                      "Maximum hours per obligation (up to 6 decimal places)",
                    )}
                    <p className="small-muted">
                      Hourly invoices include exact hours. The rate × hours must
                      fit the token’s six-decimal precision; fractions are never
                      silently rounded.
                    </p>
                  </>
                )}
                {field("ceiling", `Total commitment ceiling (${formCurrency})`)}
                {field("effectiveFrom", "Effective from", "date", today())}
                {field("effectiveTo", "Effective through", "date")}
                <label>
                  Payment policy / Safe
                  <select
                    name="policyId"
                    defaultValue={String(selected?.body.policyId ?? "")}
                  >
                    <option value="">
                      Unbound — choose before preparation
                    </option>
                    {items("policy").map((policy) => (
                      <option key={policy.id} value={policy.id}>
                        {String(
                          items("safe").find(
                            (safe) => safe.id === policy.body.safeId,
                          )?.body.name ?? policy.id,
                        )}{" "}
                        · policy v{policy.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mode
                  <select
                    name="mode"
                    defaultValue={String(selected?.body.mode ?? "observe")}
                  >
                    <option value="observe">Observe — analysis only</option>
                    <option value="prepare">Prepare — human approval</option>
                    {selected?.body.mode === "delegate" && (
                      <option value="delegate">
                        Delegate — verified authority required
                      </option>
                    )}
                  </select>
                </label>
                <label className="check-label">
                  <input
                    name="partialAllowed"
                    type="checkbox"
                    defaultChecked={Boolean(selected?.body.partialAllowed)}
                  />
                  Agreement permits partial payment.
                </label>
                {field(
                  "minimumPartial",
                  `Minimum partial payment (${formCurrency}; optional)`,
                  "text",
                  "",
                  false,
                )}
                <label className="check-label">
                  <input
                    name="acceptanceRequired"
                    type="checkbox"
                    defaultChecked={
                      selected?.kind === "engagement"
                        ? Boolean(selected.body.acceptanceRequired)
                        : true
                    }
                  />
                  Require customer delivery acceptance.
                </label>
                {field(
                  "acceptors",
                  "Authorized customer acceptor wallets (comma or space separated)",
                  "text",
                  wallet,
                )}
                {field(
                  "acceptanceMaxAgeSeconds",
                  "Maximum acceptance age (seconds)",
                  "number",
                  "86400",
                )}
                <label className="check-label">
                  <input name="approved" type="checkbox" />I am authorized to
                  activate these exact reviewed terms.
                </label>
                <p className="small-muted">
                  Approval is recorded to your authenticated wallet. Terms are
                  versioned; this form does not sign a transaction. USD is
                  recorded as USD and is not silently treated as USDC.
                </p>
              </>
            )}
            {form === "invoice" && (
              <>
                {selected?.kind === "invoice" && (
                  <>
                    <p className="console-version-note">
                      Correction of version {selected.version}. The original
                      agreement, obligation and period stay bound. Allocated
                      invoices cannot change payable terms until their
                      operations are reconciled.
                    </p>
                    <input
                      type="hidden"
                      name="engagementId"
                      value={String(selected.body.engagementId)}
                    />
                  </>
                )}
                {choose("engagementId", "Agreement", engagements, "title")}
                {selected?.kind === "invoice" && (
                  <label className="check-label">
                    <input name="rebind" type="checkbox" />I reviewed the
                    current agreement amendment and explicitly bind this
                    corrected invoice to its current version.
                  </label>
                )}
                {field("reference", "Invoice number")}
                <label>
                  Invoice currency
                  <select
                    name="currency"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                  >
                    <option value="USDC">USDC</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                {field("amount", `Invoice amount (${formCurrency})`)}
                {field(
                  "quantity",
                  "Hours / quantity (required for hourly invoices)",
                  "text",
                  "",
                  false,
                )}
                {field("periodStart", "Billing period starts", "date")}
                {field("periodEnd", "Billing period ends", "date")}
                {field("dueDate", "Due date", "date")}
                {selected?.kind === "invoice" && (
                  <label className="check-label">
                    <input name="rebindDestination" type="checkbox" />I
                    independently reviewed the current registered vendor
                    destination:{" "}
                    {String(
                      vendors.find((v) => v.id === selected.body.vendorId)?.body
                        .destination ?? "Unavailable",
                    )}{" "}
                    · chain{" "}
                    {String(
                      vendors.find((v) => v.id === selected.body.vendorId)?.body
                        .chainId ?? "Unavailable",
                    )}
                    . Bind this corrected invoice to that exact destination and
                    version.
                  </label>
                )}
                <label>
                  Destination on invoice (blank uses verified vendor
                  destination)
                  <input
                    name="destination"
                    defaultValue={String(
                      selected?.kind === "invoice"
                        ? (selected.body.destination ?? "")
                        : "",
                    )}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    required
                    defaultValue={String(
                      selected?.kind === "invoice"
                        ? (selected.body.description ?? "")
                        : "",
                    )}
                  />
                </label>
              </>
            )}
            {form === "prepare" && selected && (
              <>
                <p>
                  Creates a version-bound proposal. The server rechecks
                  agreement terms, delivery acceptance, allocations, current
                  policy and reconciled history. No funds are submitted.
                </p>
                <p>
                  Unallocated remainder:{" "}
                  <strong>
                    {money(
                      exactBalance?.data.remaining,
                      selected.body.currency,
                    )}
                  </strong>
                  . Existing unknown operations keep their reserved capacity.
                </p>
                {field(
                  "requestedAmount",
                  "Exact proposal amount (USDC)",
                  "text",
                  decimal(exactBalance?.data.remaining),
                )}
                <p className="small-muted">
                  A smaller amount requires terms that permit partial payments
                  and must meet any minimum. Keep this form open after a timeout
                  to retry the original operation.
                </p>
                <details>
                  <summary>Operation identity</summary>
                  <code>{prepareKey}</code>
                </details>
              </>
            )}
            {form === "github" && (
              <>
                {field("owner", "GitHub repository owner")}
                {field("repo", "Repository name")}
                {field("number", "Pull request number", "number")}
                <p>
                  Fetches current source evidence. A merged pull request records
                  activity and does not authorize customer acceptance or
                  payment.
                </p>
              </>
            )}
            {form === "safe" && (
              <>
                {field("name", "Safe name")}
                {field("address", "Safe address")}
                {field("chainId", "Chain ID", "number", "5042002")}
                <p className="small-muted">
                  This records your Safe for observation. No installation
                  transaction is requested.
                </p>
              </>
            )}
            {form === "acceptance" && (
              <>
                <p>
                  Only the agreement’s authorized customer acceptor may confirm
                  delivery. Expiry follows the agreement’s acceptance-age limit.
                  Confirm the exact current version and the deliverable
                  described below.
                </p>
                <label>
                  What was accepted and under which condition?
                  <textarea name="statement" required />
                </label>
              </>
            )}
            {form === "override" && (
              <>
                <p>
                  Owner-only, scoped to this invoice version. This action cannot
                  force payment or change future policy. Clearing a hold
                  requires a recent sign-in and fresh verification; existing
                  broadcasts still require reconciliation.
                </p>
                <label>
                  Reason and evidence
                  <textarea name="reason" minLength={10} required />
                </label>
                <p>
                  Coverage is never added or extended by an override. Existing
                  allocation terms remain unchanged.
                </p>
              </>
            )}
            {form === "resolve" && (
              <label>
                Resolution and source evidence
                <textarea name="resolution" required />
              </label>
            )}
            {form === "case" && (
              <>
                {field("title", "Case title")}
                <label>
                  Discrepancy and required next action
                  <textarea name="reason" required />
                </label>
              </>
            )}
            {form === "evidence" && (
              <>
                <label>
                  Evidence summary
                  <textarea name="summary" required />
                </label>
                {field("source", "Source reference")}
                <p>
                  Evidence of activity does not automatically establish
                  contractual acceptance.
                </p>
              </>
            )}
            {form === "destination" && (
              <>
                <p>
                  Confirm the requested change using the vendor’s previously
                  established contact channel. A forwarded invoice is not
                  enough.
                </p>
                {field("destination", "New verified destination")}
                {field(
                  "chainId",
                  "Destination chain ID",
                  "number",
                  String(selected?.body.chainId ?? 5042002),
                )}
                <label>
                  Independent verification evidence
                  <textarea name="reason" required />
                </label>
                <label>
                  Solo operator exception reason (only if no independent
                  reviewer exists)
                  <textarea name="soloExceptionReason" />
                </label>
              </>
            )}
            {form === "member" && (
              <>
                {field("wallet", "Member wallet address")}
                <label>
                  Role
                  <select name="role">
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="approver">Approver</option>
                  </select>
                </label>
              </>
            )}
            {form === "policy" && (
              <>
                {choose("safeId", "Safe", items("safe"), "name")}
                {field("perPayment", "Per-payment limit (USDC)")}
                {field("rolling24h", "Rolling 24-hour limit (USDC)")}
                {field("totalAllocation", "Total delegated allocation (USDC)")}
                {field("cashFloor", "Minimum operating cash (USDC)")}
                {field("protectedAmount", "Protected obligations (USDC)")}
                {field("feeReserve", "Fee reserve (USDC)")}
                {field(
                  "expiresAt",
                  "Policy expiry",
                  "datetime-local",
                  policyExpiry,
                )}
                <p>
                  Preview only. Installation and independent recovery must be
                  verified before delegation.
                </p>
              </>
            )}
            {["engagement", "invoice", "acceptance"].includes(form) && (
              <label>
                Original source document
                <select
                  name="sourceId"
                  defaultValue={String(selected?.body.sourceId ?? "")}
                >
                  <option value="">Manual entry — no uploaded original</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.filename}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={
                busy ||
                (form === "import" &&
                  Boolean(
                    importPreview?.rows.some((r) => r.status === "error"),
                  ))
              }
            >
              {busy
                ? "Saving…"
                : form === "import"
                  ? importPreview
                    ? "Import validated invoices"
                    : "Validate import"
                  : form === "prepare"
                    ? "Prepare reviewed amount"
                    : "Save to workspace"}
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}
