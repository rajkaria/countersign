"use client";
import {
  useState,
  useEffect,
  useRef,
  useId,
  startTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  LayoutDashboard,
  Files,
  CirclePause,
  CalendarDays,
  Activity,
  ShieldCheck,
  FlaskConical,
  Fingerprint,
  Search,
  Plus,
  Download,
  ChevronRight,
  X,
  Check,
  RotateCcw,
  ExternalLink,
  CheckCheck,
  LockKeyhole,
  Menu,
  Info,
  BookOpen,
} from "lucide-react";
import { Brand } from "./brand";
import { OperationsCenter } from "./console/operations-center";
import {
  INITIAL_INVOICES,
  type DemoInvoice,
  type InvoiceStatus,
  parseInvoiceInput,
  resolveAcceptance,
  planPayments,
  toCsv,
  runRecoveryScenario,
  createDemoReceipt,
  getDemoReview,
  isDemoFixture,
  invoiceMoney,
  UNVERIFIED_SAMPLE_REASON,
} from "@/lib/demo";
import { formatObligationAmount } from "@/lib/domain/money";
const navigation = [
  { id: "", label: "Overview", icon: LayoutDashboard },
  { id: "obligations", label: "Obligations", icon: Files },
  { id: "cases", label: "Needs a decision", icon: CirclePause },
  { id: "plan", label: "Payment plan", icon: CalendarDays },
  { id: "operations", label: "Operations desk", icon: CalendarDays },
  { id: "activity", label: "Activity & receipts", icon: Activity },
  { id: "authority", label: "Authority & protection", icon: ShieldCheck },
  { id: "recovery", label: "Recovery lab", icon: FlaskConical },
  { id: "evidence", label: "Customer evidence", icon: Fingerprint },
];
const statusLabels: Record<InvoiceStatus, string> = {
  ready: "Ready to prepare",
  held: "Needs a decision",
  scheduled: "Scheduled",
  settled: "Settled · sample",
};
const STORAGE = "countersign-isolated-demo-v1";
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Status({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {statusLabels[status]}
    </span>
  );
}
export function Workspace({ view = "" }: { view?: string }) {
  const [invoices, setInvoices] = useState<DemoInvoice[]>(INITIAL_INVOICES),
    [loaded, setLoaded] = useState(false),
    [selected, setSelected] = useState<DemoInvoice | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [toast, setToast] = useState(""),
    [showAdd, setShowAdd] = useState(false),
    [showReset, setShowReset] = useState(false),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [accepting, setAccepting] = useState(false),
    [agreed, setAgreed] = useState(false),
    [labResult, setLabResult] = useState<string | null>(null),
    [mode, setMode] = useState("observe");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const values: unknown = JSON.parse(raw);
        if (
          Array.isArray(values) &&
          values.length < 500 &&
          values.every(
            (i) =>
              i &&
              typeof i.id === "string" &&
              typeof i.vendor === "string" &&
              typeof i.initials === "string" &&
              typeof i.reference === "string" &&
              typeof i.description === "string" &&
              typeof i.reason === "string" &&
              typeof i.due === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(i.due) &&
              Number.isFinite(Date.parse(i.due)) &&
              new Date(i.due).toISOString().slice(0, 10) === i.due &&
              ["ready", "held", "scheduled", "settled"].includes(i.status) &&
              [
                "none",
                "acceptance",
                "destination",
                "duplicate",
                "source",
              ].includes(i.issue) &&
              Number.isSafeInteger(i.amountCents) &&
              i.amountCents > 0 &&
              Number.isInteger(i.version) &&
              Array.isArray(i.history) &&
              i.history.every((h: unknown) => typeof h === "string"),
          )
        )
          startTransition(() =>
            setInvoices(
              values.map((invoice: DemoInvoice) =>
                isDemoFixture(invoice)
                  ? { ...invoice, currency: "USDC" }
                  : {
                      ...invoice,
                      currency: "USD",
                      status: "held",
                      issue: "source",
                      reason: UNVERIFIED_SAMPLE_REASON,
                    },
              ),
            ),
          );
      }
    } catch {
      startTransition(() =>
        setToast("Saved demo could not be loaded. Original samples restored."),
      );
    }
    startTransition(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(invoices));
      } catch {
        startTransition(() =>
          setToast(
            "Browser storage is unavailable. Keep this tab open to retain demo changes.",
          ),
        );
      }
    }
  }, [invoices, loaded]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const held = invoices.filter((i) => i.status === "held"),
    ready = invoices.filter((i) => i.status === "ready"),
    open = invoices.filter((i) => i.status !== "settled");
  const visible = invoices.filter(
    (i) =>
      (view !== "cases" || i.status === "held") &&
      (filter === "all" || i.status === filter) &&
      `${i.vendor} ${i.reference} ${i.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const plan = planPayments(invoices, 1050000);
  const selectedReview = selected ? getDemoReview(selected) : null;
  function updateInvoice(next: DemoInvoice) {
    setInvoices((current) => current.map((i) => (i.id === next.id ? next : i)));
    setSelected(next);
  }
  function addInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const invoice = parseInvoiceInput({
        vendor: String(data.get("vendor")),
        reference: String(data.get("reference")),
        amount: String(data.get("amount")),
        due: String(data.get("due")),
      });
      if (
        invoices.some(
          (i) => i.reference.toLowerCase() === invoice.reference.toLowerCase(),
        )
      )
        throw new Error("That invoice reference is already in this demo.");
      setInvoices((current) => [invoice, ...current]);
      setShowAdd(false);
      setToast(
        "Custom sample added. Approved source evidence is required; the invoice stays on hold.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add invoice.");
    }
  }
  function receipt(invoice: DemoInvoice) {
    download(
      `${invoice.reference}-sample-receipt.json`,
      JSON.stringify(createDemoReceipt(invoice), null, 2),
    );
    setToast(
      "Sample receipt downloaded. This is an illustrative record, not proof of payment.",
    );
  }
  const title = navigation.find((n) => n.id === view)?.label ?? "Overview";
  return (
    <div className="workspace">
      <aside
        id="workspace-sidebar"
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
      >
        <Brand />
        <div className="workspace-selector">
          <span className="team-avatar">M</span>
          <div>
            <strong>Meridian collective</strong>
            <span>Sample workspace</span>
          </div>
          <span className="demo-pill">DEMO</span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/workspace${id ? `/${id}` : ""}`}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "active" : ""}
              onClick={() => setMenu(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "cases" && held.length > 0 && (
                <span className="nav-count">{held.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <FlaskConical size={19} />
            <strong>A safe place to explore.</strong>
            <p>Synthetic records. Browser-only changes. No money movement.</p>
            <button onClick={() => setShowReset(true)}>
              <RotateCcw size={13} /> Reset demo
            </button>
          </div>
          <Link href="/docs">
            <BookOpen size={16} /> Documentation <ArrowUpRight size={14} />
          </Link>
          <Link href="/login">
            <LockKeyhole size={16} /> Open live workspace{" "}
            <ArrowUpRight size={14} />
          </Link>
          <div className="profile">
            <span className="profile-avatar">YO</span>
            <div>
              <strong>You, the operator</strong>
              <span>Demo reviewer</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
              aria-controls="workspace-sidebar"
              aria-expanded={menu}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} /> <strong>{title}</strong>
            </span>
          </div>
          <div className="header-right">
            <span className="environment-label">
              <span /> Isolated sandbox
            </span>
            <Link href="/docs/getting-started" className="help-link">
              Getting started <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <div className="sandbox-banner">
          <FlaskConical size={15} />
          <span>
            You’re exploring synthetic data. All actions stay in this browser.
            No funds move.
          </span>
          <Link href="/login">
            Use your own data <ArrowRight size={14} />
          </Link>
        </div>
        <main id="main" className="workspace-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === ""
                  ? "YOUR PAYMENT WORKSPACE"
                  : "MERIDIAN COLLECTIVE · DEMO"}
              </div>
              <h1>{view === "" ? "Good decisions. Clear payments." : title}</h1>
              <p>
                {view === ""
                  ? "Here’s what needs your attention before the next payment run."
                  : (
                      {
                        obligations:
                          "The agreement, delivery, and payment history. Together.",
                        cases:
                          "Resolve the evidence gap. Keep the rest of the payment moving.",
                        plan: "A payment schedule built on confirmed cash, not expected revenue.",
                        activity:
                          "Follow each decision from review to reconciliation.",
                        authority:
                          "Explicit permission. Visible exposure. Independent human control.",
                        recovery:
                          "Explore what happens when the happy path stops.",
                        evidence:
                          "Real customer outcomes belong here, with explicit consent.",
                      } as Record<string, string>
                    )[view]}
              </p>
            </div>
            {["", "obligations"].includes(view) && (
              <button
                className="button button-small"
                onClick={() => {
                  setError("");
                  setShowAdd(true);
                }}
              >
                <Plus size={17} /> Add sample invoice
              </button>
            )}
          </div>
          {view === "" && (
            <>
              <div className="metric-grid">
                <Metric
                  label="Open invoice value"
                  value={totalMoney(open)}
                  detail={`${open.length} invoices · includes held duplicates`}
                />
                <Metric
                  label="Ready to prepare"
                  value={totalMoney(ready)}
                  detail={`${ready.length} ${ready.length === 1 ? "invoice matches" : "invoices match"} all checks`}
                  accent
                />
                <Metric
                  label="Needs your decision"
                  value={String(held.length).padStart(2, "0")}
                  detail="Specific evidence. Clear next action."
                />
                <Metric
                  label="Available after buffer"
                  value="10,500.00 USDC"
                  detail="18,500 USDC cash − 8,000 USDC reserve"
                />
              </div>
              <div className="attention-panel">
                <div className="attention-icon">
                  <CirclePause size={23} />
                </div>
                <div>
                  <div className="eyebrow">A SECOND LOOK</div>
                  <h2>
                    {held.length
                      ? `${held[0].vendor} needs ${held[0].issue === "acceptance" ? "your acceptance" : "a review"}.`
                      : "Your exception inbox is clear."}
                  </h2>
                  <p>
                    {held.length
                      ? held[0].reason
                      : "All sample exceptions have been resolved. Review your payment plan next."}
                  </p>
                </div>
                {held.length ? (
                  <button
                    className="button button-small"
                    onClick={() => {
                      setSelected(held[0]);
                      setAccepting(false);
                      setAgreed(false);
                    }}
                  >
                    Review case <ArrowRight size={16} />
                  </button>
                ) : (
                  <Link className="button button-small" href="/workspace/plan">
                    View plan <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            </>
          )}
          {view === "operations" && <OperationsCenter demo role="owner" />}
          {["", "obligations", "cases"].includes(view) && (
            <section className="panel invoice-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {view === "cases"
                      ? "Open exceptions"
                      : view === "obligations"
                        ? "All obligations"
                        : "Your payment queue"}
                  </h2>
                  <span>
                    {visible.length}{" "}
                    {visible.length === 1 ? "record" : "records"} · Exact sample
                    currencies
                  </span>
                </div>
                <button
                  className="button-quiet"
                  onClick={() => {
                    download(
                      "countersign-sample-export.csv",
                      toCsv(visible),
                      "text/csv;charset=utf-8",
                    );
                    setToast(
                      "CSV exported with explicit synthetic environment labels.",
                    );
                  }}
                >
                  <Download size={15} /> Export CSV
                </button>
              </div>
              <div className="table-tools">
                <div className="tabs" aria-label="Filter by status">
                  {(view === "cases"
                    ? ["all"]
                    : ["all", "ready", "held", "scheduled", "settled"]
                  ).map((item) => (
                    <button
                      aria-pressed={filter === item}
                      onClick={() => setFilter(item)}
                      key={item}
                      className={filter === item ? "selected" : ""}
                    >
                      {
                        (
                          {
                            all: "All invoices",
                            ready: "Ready",
                            held: "Needs decision",
                            scheduled: "Scheduled",
                            settled: "Settled",
                          } as Record<string, string>
                        )[item]
                      }
                    </button>
                  ))}
                </div>
                <label className="search-input">
                  <Search size={15} />
                  <input
                    aria-label="Search invoices"
                    placeholder="Search invoices…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="table-scroll">
                <table className="invoice-table">
                  <thead>
                    <tr>
                      <th>Vendor / invoice</th>
                      <th>Amount</th>
                      <th>Due date</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Review</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <button
                            className="vendor-cell"
                            onClick={() => {
                              setSelected(invoice);
                              setAccepting(false);
                              setAgreed(false);
                            }}
                          >
                            <span
                              className={`vendor-avatar avatar-${invoice.initials.toLowerCase()}`}
                            >
                              {invoice.initials}
                            </span>
                            <span>
                              <strong>{invoice.vendor}</strong>
                              <small>
                                {invoice.reference}{" "}
                                <span>
                                  · {invoice.description.split(" · ")[0]}
                                </span>
                              </small>
                            </span>
                          </button>
                        </td>
                        <td className="amount-cell">
                          {invoiceMoney(invoice)}
                          <small>{invoice.currency}</small>
                        </td>
                        <td>
                          {new Date(
                            invoice.due + "T12:00:00Z",
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                          <small>{invoice.due.slice(0, 4)}</small>
                        </td>
                        <td>
                          <Status status={invoice.status} />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Review ${invoice.reference}`}
                            onClick={() => {
                              setSelected(invoice);
                              setAccepting(false);
                              setAgreed(false);
                            }}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && (
                  <Empty
                    icon={<Search size={27} />}
                    title="No invoices match"
                    description="Try another vendor name, invoice reference, or status."
                    action={
                      <button
                        className="button button-small"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                        }}
                      >
                        Clear filters
                      </button>
                    }
                  />
                )}
              </div>
              <div className="panel-footer">
                <ShieldCheck size={14} />
                <span>
                  Prepared is not paid. Settlement requires a confirmed
                  destination receipt.
                </span>
                <Link href="/docs/payments">
                  How checks work <ArrowUpRight size={13} />
                </Link>
              </div>
            </section>
          )}
          {view === "" && (
            <div className="bottom-grid">
              <section className="panel short-panel">
                <div className="panel-heading">
                  <h2>Around the corner</h2>
                  <CalendarDays size={18} />
                </div>
                <div className="upcoming-row">
                  <div className="date-block">
                    <span>OCT</span>
                    <strong>02</strong>
                  </div>
                  <div>
                    <strong>Orbit Engineering</strong>
                    <p>Ready to prepare · Approved monthly retainer</p>
                  </div>
                  <strong>4,800.00 USDC</strong>
                </div>
                <Link href="/workspace/plan" className="panel-link">
                  See the payment plan <ArrowRight size={15} />
                </Link>
              </section>
              <section className="panel short-panel">
                <div className="panel-heading">
                  <h2>You set the boundaries</h2>
                  <ShieldCheck size={18} />
                </div>
                <p className="short-panel-copy">
                  This workspace is in <strong>Observe</strong>. No execution
                  authority is installed. Explore your permission preview before
                  delegation.
                </p>
                <Link href="/workspace/authority" className="panel-link">
                  Review authority & exposure <ArrowRight size={15} />
                </Link>
              </section>
            </div>
          )}
          {view === "plan" && (
            <>
              <div className="metric-grid">
                <Metric
                  label="Confirmed sample cash"
                  value="18,500.00 USDC"
                  detail="Synthetic balance · no linked wallet"
                />
                <Metric
                  label="Protected commitments"
                  value="8,000.00 USDC"
                  detail="Operating buffer and existing obligations"
                />
                <Metric
                  label="Available to plan"
                  value="10,500.00 USDC"
                  detail="Expected revenue excluded"
                  accent
                />
                <Metric
                  label="Eligible obligations"
                  value={totalMoney(
                    plan.items
                      .filter((item) => item.eligible)
                      .map((item) => item.invoice),
                  )}
                  detail={`${plan.items.filter((item) => item.eligible).length} ready or scheduled`}
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Your upcoming payment plan</h2>
                  <span>Production planner · synthetic inputs</span>
                </div>
                <div className="callout">
                  <Info size={19} />
                  <div>
                    <strong>Reproducible synthetic snapshot</strong>
                    <p>
                      As of {plan.generatedAt}.{" "}
                      {formatObligationAmount(plan.input.confirmedCash, "USDC")}{" "}
                      confirmed sample cash;{" "}
                      {formatObligationAmount(plan.protectedTotal, "USDC")}{" "}
                      reserve. No wallet, balance observation, policy or signing
                      authority is connected. Custom USD invoices remain held
                      and are excluded from USDC cash comparisons.
                    </p>
                    <details>
                      <summary>Inspect synthetic planning inputs</summary>
                      <p>
                        Expected inflow:{" "}
                        {formatObligationAmount(plan.expectedInflows, "USDC")},
                        excluded from spendable cash. Each eligible item
                        reserves capacity only when confirmed cash covers it.
                        Future due dates remain scheduled.
                      </p>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {JSON.stringify(plan.input, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
                <div className="plan-list">
                  {plan.items.map((item, index) => {
                    const i = item.invoice;
                    return (
                      <div className="plan-row" key={i.id}>
                        <div className="plan-sequence">{index + 1}</div>
                        <div className="date-block">
                          <span>
                            {new Date(`${i.due}T12:00:00Z`)
                              .toLocaleDateString("en-US", {
                                month: "short",
                                timeZone: "UTC",
                              })
                              .toUpperCase()}
                          </span>
                          <strong>{i.due.slice(-2)}</strong>
                          <span>{i.due.slice(0, 4)}</span>
                        </div>
                        <div className="plan-vendor">
                          <h3>{i.vendor}</h3>
                          <p>
                            {item.action}: {item.reason}
                          </p>
                          {item.eligible && (
                            <p>
                              Window: {item.executionAt.slice(0, 10)} ·
                              Shortfall:{" "}
                              {formatObligationAmount(item.shortfall, "USDC")}
                            </p>
                          )}
                        </div>
                        <strong>
                          {invoiceMoney(i)} {i.currency}
                        </strong>
                        <span
                          className={`badge badge-${item.reserved ? "ready" : "held"}`}
                        >
                          {item.reserved
                            ? "Capacity reserved"
                            : item.eligible
                              ? "Cash shortfall"
                              : "HOLD"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="panel-footer">
                  <Info size={15} /> Held invoices reserve no new capacity.
                  Resolve their evidence requirements before planning a payment.
                </div>
              </section>
              <div className="callout">
                <CalendarDays size={21} />
                <div>
                  <strong>Why not count forecast revenue?</strong>
                  <p>
                    Expected deposits can slip. The plan uses confirmed cash
                    after protected commitments and recomputes when actual funds
                    arrive. This sample has no live balance connection.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "activity" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Decision trail</h2>
                  <span>Every change retains its context</span>
                </div>
                <button
                  className="button-quiet"
                  onClick={() =>
                    download(
                      "countersign-demo-activity.json",
                      JSON.stringify(
                        { environment: "synthetic", invoices },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Download size={15} /> Export trail
                </button>
              </div>
              <div className="activity-list">
                {invoices.map((i) => (
                  <article key={i.id}>
                    <span
                      className={`activity-icon ${i.status === "held" ? "is-held" : ""}`}
                    >
                      {i.status === "held" ? (
                        <CirclePause size={18} />
                      ) : (
                        <CheckCheck size={18} />
                      )}
                    </span>
                    <div>
                      <h3>
                        {i.vendor} <span>{i.reference}</span>
                      </h3>
                      <p>{i.history[i.history.length - 1]}</p>
                      <div className="activity-meta">
                        Decision v{i.version} · {invoiceMoney(i)} {i.currency} ·
                        Synthetic record
                      </div>
                    </div>
                    <button
                      className="button-quiet"
                      disabled={!isDemoFixture(i)}
                      onClick={() => receipt(i)}
                    >
                      <Download size={15} /> Receipt
                    </button>
                  </article>
                ))}
              </div>
              <div className="panel-footer">
                <Fingerprint size={15} /> Sample receipts use the production
                integrity schema. Synthetic identities, no signature, no
                settlement assertion.
              </div>
            </section>
          )}
          {view === "authority" && (
            <>
              <div className="callout">
                <ShieldCheck size={23} />
                <div>
                  <strong>No authority installed</strong>
                  <p>
                    This sandbox cannot connect a signer, install a module, or
                    authorize a payment. Explore a policy below; it is a preview
                    only.
                  </p>
                </div>
              </div>
              <div className="authority-mode-grid">
                {[
                  {
                    id: "observe",
                    title: "Observe",
                    copy: "Import records and review findings. No transaction preparation or execution.",
                  },
                  {
                    id: "prepare",
                    title: "Prepare",
                    copy: "Create payment proposals for authorized humans to review and sign.",
                  },
                  {
                    id: "delegate",
                    title: "Delegate",
                    copy: "Execute eligible obligations within an explicitly installed Safe policy.",
                  },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`authority-mode ${mode === m.id ? "selected" : ""}`}
                    onClick={() => setMode(m.id)}
                    aria-pressed={mode === m.id}
                  >
                    <span className="radio-circle">
                      {mode === m.id && <span />}
                    </span>
                    <h3>{m.title}</h3>
                    <p>{m.copy}</p>
                    {m.id === "observe" && (
                      <span className="badge">DEFAULT START</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>
                      {mode === "delegate"
                        ? "Example delegation"
                        : "Permission"}{" "}
                      preview
                    </h2>
                    <span className="badge">NOT INSTALLED</span>
                  </div>
                  <dl className="details-list">
                    <div>
                      <dt>Execution authority</dt>
                      <dd>
                        {mode === "delegate"
                          ? "Bounded module (proposed)"
                          : "None"}
                      </dd>
                    </div>
                    <div>
                      <dt>Maximum per payment</dt>
                      <dd>
                        {mode === "delegate" ? "5,000.00 USDC" : "0.00 USDC"}
                      </dd>
                    </div>
                    <div>
                      <dt>Rolling 24-hour maximum</dt>
                      <dd>
                        {mode === "delegate" ? "15,000.00 USDC" : "0.00 USDC"}
                      </dd>
                    </div>
                    <div>
                      <dt>Allowed destinations</dt>
                      <dd>Approved vendor register only</dd>
                    </div>
                    <div>
                      <dt>Policy changes</dt>
                      <dd>Authenticated Safe owners</dd>
                    </div>
                    <div>
                      <dt>Human threshold</dt>
                      <dd>Unchanged</dd>
                    </div>
                  </dl>
                  <Link href="/docs/security" className="panel-link">
                    Read installation and revocation requirements{" "}
                    <ArrowUpRight size={15} />
                  </Link>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Protection capacity</h2>
                    <span className="badge badge-held">NOT ACTIVE</span>
                  </div>
                  <div className="protection-amount">
                    $0 <span>funded reserve</span>
                  </div>
                  <p className="short-panel-copy">
                    No coverage is offered in this workspace. Coverage requires
                    approved terms, an independent claims process, and a fully
                    reserved allocation for each advertised liability.
                  </p>
                  <dl className="details-list">
                    <div>
                      <dt>Covered principal</dt>
                      <dd>$0</dd>
                    </div>
                    <div>
                      <dt>Available capacity</dt>
                      <dd>$0</dd>
                    </div>
                    <div>
                      <dt>Pending claims reserve</dt>
                      <dd>$0</dd>
                    </div>
                  </dl>
                  <Link href="/docs/protection" className="panel-link">
                    Understand limited protection <ArrowUpRight size={15} />
                  </Link>
                </section>
              </div>
              <div className="callout">
                <LockKeyhole size={20} />
                <div>
                  <strong>Owners retain a way out.</strong>
                  <p>
                    Pause automation or revoke the module through your Safe
                    without depending on the agent or this application.
                  </p>
                  <Link href="/docs/recovery">
                    Open independent recovery instructions{" "}
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              </div>
            </>
          )}
          {view === "recovery" && (
            <>
              <div className="callout">
                <FlaskConical size={23} />
                <div>
                  <strong>Adversarial scenarios, safely isolated</strong>
                  <p>
                    Run isolated fixtures through the same pure verification,
                    execution, and reserve logic used by the application. No
                    provider, signer, or blockchain is contacted.
                  </p>
                </div>
              </div>
              <div className="lab-grid">
                {[
                  {
                    id: "timeout",
                    title: "Timeout after broadcast",
                    icon: Activity,
                    copy: "A provider times out after accepting a transaction.",
                    result:
                      "Operation op_sample_0042 is retained. State: reconciliation_required. A new transfer is blocked until the original outcome is known. Expected next step: query the source transaction using the original operation identity.",
                  },
                  {
                    id: "duplicate",
                    title: "Duplicate submission",
                    icon: Files,
                    copy: "Two requests attempt to pay the same obligation.",
                    result:
                      "The second request refers to the existing payment identity. No new obligation allocation is created. Expected next step: return the existing payment state; never create another transfer.",
                  },
                  {
                    id: "stale",
                    title: "Acceptance becomes stale",
                    icon: CirclePause,
                    copy: "The agreement changes after a payment was prepared.",
                    result:
                      "The permit binds agreement v2; the active agreement is v3. Verification rejects the old permit. Expected next step: collect current authorized acceptance and issue a new decision.",
                  },
                  {
                    id: "malicious",
                    title: "Invoice recipient mismatch",
                    icon: ShieldCheck,
                    copy: "An invoice claims a different address from the approved register. This checks deterministic recipient validation; no model is run.",
                    result:
                      "Document text has no authority to change the vendor register. The invoice is held for a recipient mismatch. Expected next step: an authenticated owner reviews the destination change independently.",
                  },
                  {
                    id: "bridge",
                    title: "Source confirmed, destination missing",
                    icon: ArrowRight,
                    copy: "USDC leaves the source but is not confirmed at the destination.",
                    result:
                      "Payment remains settling. No paid status, receipt of destination settlement, or second source transfer is generated. Expected next step: reconcile the existing route and destination receipt.",
                  },
                  {
                    id: "reserve",
                    title: "Reserve capacity exhausted",
                    icon: LockKeyhole,
                    copy: "A new coverage request exceeds unallocated reserve.",
                    result:
                      "Coverage allocation is rejected. Pending claims continue to reserve capacity. Expected next step: disclose uncovered status or await separately authorized reserve funding; never silently dilute protection.",
                  },
                ].map(({ id, title, icon: Icon, copy }) => (
                  <article className="lab-card" key={id}>
                    <Icon size={25} />
                    <h3>{title}</h3>
                    <p>{copy}</p>
                    <button
                      className="button-quiet"
                      onClick={() =>
                        setLabResult(`${title}|${runRecoveryScenario(id)}`)
                      }
                    >
                      Run safety fixture <ArrowRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {view === "evidence" && (
            <section className="panel">
              <Empty
                icon={<Fingerprint size={33} />}
                title="Real evidence earns its place."
                description="No customer evidence has been published. The public demo uses synthetic records. Customer examples will appear only with explicit consent, redaction, operator confirmation, and verifiable outcome evidence."
                action={
                  <Link className="button button-small" href="/docs/evaluation">
                    How evidence is measured <ArrowUpRight size={15} />
                  </Link>
                }
              />
              <div className="evidence-categories">
                <div>
                  <strong>0</strong>
                  <span>Consented businesses</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Verified real payments</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Measured repeat cycles</span>
                </div>
              </div>
              <div className="panel-footer">
                <Info size={15} /> Synthetic, historical, founder-owned,
                independent, testnet, and mainnet cohorts remain separate.
              </div>
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="status-dot" /> Demo environment · no live
              provider sync
            </span>
            <Link href="/docs/release-status">
              Release status <ArrowUpRight size={12} />
            </Link>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {showAdd && (
        <Modal title="Add a sample invoice" onClose={() => setShowAdd(false)}>
          <p className="modal-description">
            Explore the intake flow with fictional data. This record stays in
            this browser and cannot trigger a payment.
          </p>
          <form onSubmit={addInvoice} className="form-stack">
            <label>
              Vendor name
              <input
                name="vendor"
                maxLength={100}
                required
                placeholder="e.g. Acme Studio"
              />
            </label>
            <label>
              Invoice reference
              <input
                name="reference"
                required
                maxLength={80}
                placeholder="e.g. ACME-001"
              />
            </label>
            <div className="form-row">
              <label>
                Amount (USD)
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="3200.00"
                />
              </label>
              <label>
                Due date
                <input
                  name="due"
                  type="date"
                  defaultValue="2026-10-05"
                  required
                />
              </label>
            </div>
            <div className="inline-note">
              <Info size={16} /> Custom input has no approved agreement or
              trusted destination. It stays on hold; sample acceptance cannot
              supply missing sources. Do not enter private customer information.
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button" type="submit">
              Add to review queue <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {showReset && (
        <Modal
          title="Reset the sample workspace?"
          onClose={() => setShowReset(false)}
        >
          <p className="modal-description">
            This removes invoice additions and decisions made in this browser,
            then restores the original fictional records. Export anything you
            want to keep first.
          </p>
          <div className="modal-actions">
            <button
              className="button-quiet"
              onClick={() => setShowReset(false)}
            >
              Keep exploring
            </button>
            <button
              className="button"
              onClick={() => {
                setInvoices(INITIAL_INVOICES);
                setShowReset(false);
                setSelected(null);
                setToast("The original sample workspace has been restored.");
              }}
            >
              Reset sample data <RotateCcw size={16} />
            </button>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.vendor} onClose={() => setSelected(null)}>
          <div className="detail-summary">
            <div>
              <span>
                {selected.reference} · Decision v{selected.version}
              </span>
              <h3>
                {invoiceMoney(selected)} <small>{selected.currency}</small>
              </h3>
            </div>
            <Status status={selected.status} />
          </div>
          <div
            className={`decision-explanation ${selected.status === "held" ? "explanation-held" : ""}`}
          >
            <ShieldCheck size={20} />
            <div>
              <strong>
                {selected.status === "held"
                  ? "Why this is held"
                  : "What the evidence says"}
              </strong>
              <p>{selected.reason}</p>
            </div>
          </div>
          <h3 className="detail-label">THE EVIDENCE, SIDE BY SIDE</h3>
          <div className="evidence-comparison">
            <div>
              <span>
                {selectedReview?.approvedTerms
                  ? "Approved agreement"
                  : "Source required"}
              </span>
              <strong>
                {selectedReview?.approvedTerms
                  ? selected.description.split(" · ")[0]
                  : "No approved agreement supplied"}
              </strong>
              {selectedReview?.approvedTerms ? (
                <>
                  <p>
                    {invoiceMoney(selected)} {selected.currency} · Fictional
                    approved vendor destination
                    <br />
                    Acceptance required before release
                  </p>
                  <small>
                    Fictional agreement · version{" "}
                    {selectedReview.decision.engagementVersion}
                  </small>
                </>
              ) : (
                <p>
                  This typed sample has no original terms, billing period,
                  authenticated destination or authorized acceptance. Those
                  sources cannot be invented from an amount and due date.
                </p>
              )}
            </div>
            <div>
              <span>Received invoice</span>
              <strong>{selected.reference}</strong>
              <p>
                {invoiceMoney(selected)} {selected.currency} ·{" "}
                {!selectedReview?.approvedTerms
                  ? "Destination not supplied"
                  : selected.issue === "destination"
                    ? "Unrecognized destination"
                    : "Approved destination matches"}
                <br />
                {!selectedReview?.approvedTerms
                  ? "Source evidence missing"
                  : selected.issue === "acceptance"
                    ? "Delivery recorded; acceptance missing"
                    : selected.issue === "duplicate"
                      ? "Already matched to an existing obligation"
                      : "Acceptance recorded"}
              </p>
              <small>Fictional invoice · {selected.due}</small>
            </div>
          </div>
          {selectedReview && (
            <>
              <div className="callout">
                <ShieldCheck size={19} />
                <div>
                  <strong>
                    Production verifier result: {selectedReview.decision.action}
                  </strong>
                  <p>{selectedReview.decision.reason}</p>
                  <p>
                    Invoice version: {selectedReview.decision.invoiceVersion} ·
                    Execution authority: none. The real pure verifier runs with
                    synthetic inputs in Observe mode; no payment is authorized.
                  </p>
                  <p>
                    Allowed proposals:{" "}
                    {selectedReview.decision.availableActions.join(", ")}
                  </p>
                </div>
              </div>
              <details
                id="demo-source-text"
                className="callout"
                style={{ display: "block" }}
              >
                <summary>Inspect synthetic source text</summary>
                <p>
                  These fictional source excerpts explain the sample. They are
                  neither customer documents nor a live model response.
                </p>
                {selectedReview.sources.map((source) => (
                  <article
                    id={`demo-source-${source.id}`}
                    key={source.id}
                    style={{ marginTop: 14, overflowWrap: "anywhere" }}
                  >
                    <strong>{source.title}</strong>
                    <p>
                      {source.location} · Source ID: {source.id}
                    </p>
                    <p>{source.content}</p>
                  </article>
                ))}
                <details>
                  <summary>
                    Inspect verifier findings and synthetic input
                  </summary>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(
                      {
                        input: selectedReview.input,
                        decision: selectedReview.decision,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </details>
              {selectedReview.modelFixture && (
                <details className="callout" style={{ display: "block" }}>
                  <summary>Recorded model proposal fixture</summary>
                  <p>
                    No model was executed. This authored sample illustrates the
                    proposal schema and is checked by the production proposal
                    validator. It provides no measured model quality, latency,
                    savings or usage evidence.
                  </p>
                  <strong>
                    Proposal only: {selectedReview.modelFixture.proposal.action}
                  </strong>
                  <p>{selectedReview.modelFixture.proposal.reason}</p>
                  <p>
                    The useful language task is explaining delivery activity
                    against the agreement’s acceptance requirement and asking a
                    precise missing question. Approved rules, destinations,
                    money and authority remain deterministic.
                  </p>
                  {selectedReview.modelFixture.proposal.missing.map(
                    (question) => (
                      <p key={question}>
                        <strong>Missing question</strong>: {question}
                      </p>
                    ),
                  )}
                  <p>
                    Citations stay inside this sample’s authorized source set:
                  </p>
                  {selectedReview.modelFixture.proposal.sourceIds.map((id) => (
                    <div key={id}>
                      <a
                        href={`#demo-source-${id}`}
                        onClick={() =>
                          document
                            .getElementById("demo-source-text")
                            ?.setAttribute("open", "")
                        }
                      >
                        Open cited source{" "}
                        {
                          selectedReview.sources.find(
                            (source) => source.id === id,
                          )?.title
                        }
                      </a>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
          <h3 className="detail-label">DECISION HISTORY</h3>
          <ol className="decision-history">
            {selected.history.map((h, index) => (
              <li key={index}>
                <span />
                {h}
              </li>
            ))}
          </ol>
          {selected.issue === "acceptance" && !accepting && (
            <div className="detail-actions">
              <button className="button" onClick={() => setAccepting(true)}>
                Review sample acceptance <ArrowRight size={15} />
              </button>
            </div>
          )}
          {selected.issue === "acceptance" && accepting && (
            <div className="acceptance-box">
              <h3>Preview the decision change</h3>
              <p>
                <span className="badge badge-held">Held</span>{" "}
                <ArrowRight size={14} />{" "}
                <span className="badge badge-ready">Ready to prepare</span>
              </p>
              <ul>
                <li>Add synthetic acceptance by the sample operator.</li>
                <li>
                  Keep the amount, recipient, and approved terms unchanged.
                </li>
                <li>Increment the decision version. No funds move.</li>
              </ul>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />{" "}
                I understand this records fictional acceptance in the sandbox.
              </label>
              <button
                className="button"
                disabled={!agreed}
                onClick={() => {
                  updateInvoice(resolveAcceptance(selected));
                  setAccepting(false);
                  setToast(
                    "Sample acceptance recorded. Review the decision diff in the history.",
                  );
                }}
              >
                Record sample acceptance <Check size={16} />
              </button>
            </div>
          )}
          {selected.issue === "destination" && (
            <div className="callout">
              <LockKeyhole size={18} />
              <div>
                <strong>Owner confirmation is required.</strong>
                <p>
                  An invoice cannot change a trusted destination. In a live
                  workspace, authenticate the owner, verify the change out of
                  band, and issue a new engagement version.
                </p>
                <Link href="/docs/agreements">
                  Read the correction workflow <ExternalLink size={13} />
                </Link>
              </div>
            </div>
          )}
          {selected.issue === "duplicate" && (
            <div className="callout">
              <Files size={18} />
              <div>
                <strong>Resolve the underlying obligation.</strong>
                <p>
                  Changing the invoice reference does not create a new amount
                  owed. Verify the original NS-1042 record before accepting any
                  replacement.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    const original = invoices.find((i) => i.id === "inv-1042");
                    if (original) {
                      setSelected(original);
                      setAccepting(false);
                      setAgreed(false);
                    }
                  }}
                >
                  Inspect original invoice <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
          {selected.status === "ready" && (
            <div className="detail-actions">
              <button
                className="button"
                onClick={() => {
                  const next: DemoInvoice = {
                    ...selected,
                    status: "scheduled",
                    version: selected.version + 1,
                    history: [
                      ...selected.history,
                      `Sample payment scheduled for ${selected.due}; no transaction created`,
                    ],
                  };
                  updateInvoice(next);
                  setToast("Added to the sample plan. No payment was sent.");
                }}
              >
                Schedule sample payment <CalendarDays size={15} />
              </button>
            </div>
          )}
          <button
            className="button-quiet receipt-download"
            disabled={!selectedReview?.approvedTerms}
            onClick={() => receipt(selected)}
          >
            <Download size={15} /> Download illustrative decision record
          </button>
        </Modal>
      )}
      {labResult && (
        <Modal
          title={labResult.split("|")[0]}
          onClose={() => setLabResult(null)}
        >
          <div className="lab-result">
            <span className="badge">EXECUTABLE LOCAL FIXTURE</span>
            <ShieldCheck size={40} />
            <h3>Fail closed. Keep the evidence.</h3>
            <p>{labResult.split("|")[1]}</p>
            <div className="inline-note">
              <Info size={16} /> This result comes from the production domain
              logic with synthetic inputs. It is not evidence of a real
              transaction or live chain test.
            </div>
            <Link href="/docs/recovery" className="button button-small">
              Read the recovery runbook <ArrowUpRight size={16} />
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
function totalMoney(invoices: DemoInvoice[]) {
  const currencies = ["USDC", "USD"] as const;
  return (
    currencies
      .flatMap((currency) => {
        const group = invoices.filter(
          (invoice) => invoice.currency === currency,
        );
        if (!group.length) return [];
        const total = group.reduce(
          (sum, invoice) => sum + invoice.amountCents,
          0,
        );
        return [
          `${invoiceMoney({ ...group[0], amountCents: total })} ${currency}`,
        ];
      })
      .join(" + ") || "0.00 USDC"
  );
}
function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
