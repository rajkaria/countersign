"use client";
import { useEffect, useState, useCallback } from "react";
import { formatTime } from "./format";
type AccessToken = {
  id: string;
  label?: string;
  case_id?: string;
  vendor_id?: string;
  created_at?: string;
  expires_at?: string;
  revoked_at?: string | null;
};
export function WorkspaceAccess({
  org,
  role,
  onAddMember,
}: {
  org: string;
  role: string;
  onAddMember: () => void;
}) {
  const [members, setMembers] = useState<{ wallet: string; role: string }[]>(
      [],
    ),
    [links, setLinks] = useState<AccessToken[]>([]),
    [keys, setKeys] = useState<AccessToken[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(() =>
      ["owner", "approver"].includes(role),
    ),
    [busy, setBusy] = useState("");
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const requestAccess = useCallback(async () => {
    const paths =
      role === "owner"
        ? ["members", "vendor-links", "intake-keys"]
        : ["vendor-links"];
    return Promise.all(
      paths.map(async (path) => {
        const r = await fetch(`/api/organizations/${org}/${path}`);
        const data = await r.json();
        if (!r.ok)
          throw new Error(
            data.error?.message ?? "Workspace access could not be loaded.",
          );
        return { path, data };
      }),
    );
  }, [org, role]);
  const applyAccess = useCallback(
    (results: Awaited<ReturnType<typeof requestAccess>>) => {
      setError("");
      setLoadedAt(Date.now());
      for (const { path, data } of results) {
        if (path === "members") setMembers(data);
        if (path === "vendor-links") setLinks(data);
        if (path === "intake-keys") setKeys(data);
      }
      setLoading(false);
    },
    [],
  );
  useEffect(() => {
    if (!["owner", "approver"].includes(role)) return;
    let active = true;
    requestAccess()
      .then((results) => {
        if (active) applyAccess(results);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [requestAccess, applyAccess, role]);
  async function load() {
    setLoading(true);
    try {
      applyAccess(await requestAccess());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Workspace access could not be loaded.",
      );
      setLoading(false);
    }
  }
  async function removeMember(wallet: string) {
    setBusy(wallet);
    setError("");
    try {
      const r = await fetch(
        `/api/organizations/${org}/members/${wallet}/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          body.error?.message ?? "Member access could not be removed.",
        );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Member access could not be removed.",
      );
    } finally {
      setBusy("");
    }
  }
  async function revoke(path: string, id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await fetch(`/api/organizations/${org}/${path}/${id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.error?.message ?? "Access could not be revoked.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Access could not be revoked.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="live-panel">
      <div className="panel-heading">
        <h2>Workspace access</h2>
        {["owner", "approver"].includes(role) && (
          <button
            className="button secondary"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            disabled={loading}
          >
            Refresh access
          </button>
        )}
      </div>
      <p>
        Workspace role: <strong>{role}</strong>. Membership grants application
        access and does not establish Safe ownership.
      </p>
      {role === "owner" && (
        <button className="button secondary" onClick={onAddMember}>
          Add or update team member
        </button>
      )}
      {error && (
        <p role="alert" className="live-alert error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading access records…</p>
      ) : (
        <>
          {role === "owner" && (
            <div className="console-related">
              <h3>Team members</h3>
              {members.map((member) => (
                <div className="live-row" key={member.wallet}>
                  <code>{member.wallet}</code>
                  <span className="live-chip">{member.role}</span>
                  {member.role !== "owner" && (
                    <button
                      className="button secondary"
                      disabled={Boolean(busy)}
                      onClick={() => void removeMember(member.wallet)}
                    >
                      {busy === member.wallet ? "Removing…" : "Remove member"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {["owner", "approver"].includes(role) && (
            <div className="console-related">
              <h3>Private vendor correction links</h3>
              {links.length ? (
                links.map((token) => (
                  <div className="live-row" key={token.id}>
                    <span>
                      Case {token.case_id?.slice(0, 8) ?? "scoped record"}
                      <small>Expires {formatTime(token.expires_at)}</small>
                    </span>
                    <span className="live-chip">
                      {token.revoked_at
                        ? "Revoked"
                        : token.expires_at &&
                            new Date(token.expires_at).getTime() < loadedAt
                          ? "Expired"
                          : "Active"}
                    </span>
                    {!token.revoked_at && (
                      <button
                        className="button secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void revoke("vendor-links", token.id)}
                      >
                        {busy === token.id ? "Revoking…" : "Revoke link"}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="small-muted">
                  Create a scoped correction link from an exception case. A
                  vendor can propose corrections without changing approved
                  terms.
                </p>
              )}
            </div>
          )}
          {role === "owner" && (
            <div className="console-related">
              <h3>Invoice forwarding keys</h3>
              {keys.length ? (
                keys.map((token) => (
                  <div className="live-row" key={token.id}>
                    <span>
                      {token.label}
                      <small>Created {formatTime(token.created_at)}</small>
                    </span>
                    <span className="live-chip">
                      {token.revoked_at ? "Revoked" : "Active"}
                    </span>
                    {!token.revoked_at && (
                      <button
                        className="button secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void revoke("intake-keys", token.id)}
                      >
                        {busy === token.id ? "Revoking…" : "Revoke key"}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="small-muted">
                  Create an invoice forwarding key in Forwarded intake. Keys can
                  submit untrusted source material and cannot approve payments.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
