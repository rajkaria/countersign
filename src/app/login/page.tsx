"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";

interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
type ExternalChallenge = { challengeId: string; message: string; expiresAt: string; wallet: string };
function failureMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
      return error.message;
  }
  return fallback;
}

export default function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [externalOpen, setExternalOpen] = useState(false), [address, setAddress] = useState("");
  const [challenge, setChallenge] = useState<ExternalChallenge | null>(null), [signature, setSignature] = useState("");
  const [externalBusy, setExternalBusy] = useState<"challenge" | "verify" | null>(null);
  const [externalError, setExternalError] = useState(""), [expired, setExpired] = useState(false), [copied, setCopied] = useState(false);
  const version = useRef(0), controller = useRef<AbortController | null>(null);

  useEffect(() => () => { version.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (!challenge) return;
    const challengeVersion = version.current;
    const timer = setTimeout(() => { if (challengeVersion === version.current) setExpired(true); }, Math.max(0, Date.parse(challenge.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [challenge]);

  function clearExternal() {
    version.current++;
    controller.current?.abort();
    controller.current = null;
    setChallenge(null); setSignature(""); setExternalError(""); setExternalBusy(null); setExpired(false); setCopied(false);
  }

  async function signIn() {
    clearExternal(); setBusy(true); setError("");
    try {
      const provider = (window as unknown as { ethereum?: WalletProvider }).ethereum;
      if (!provider) throw new Error("Open Countersign in a browser with an Ethereum wallet installed, or use an external wallet below. You can explore the demo without a wallet.");
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[], wallet = accounts[0];
      const challengeResponse = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(failureMessage(challenge, "Could not create a sign-in request."));
      const signature = await provider.request({ method: "personal_sign", params: [`0x${Array.from(new TextEncoder().encode(challenge.message)).map(b => b.toString(16).padStart(2, "0")).join("")}`, wallet] });
      const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, signature }) });
      const result = await response.json();
      if (!response.ok) throw new Error(failureMessage(result, "Sign in could not be completed."));
      router.push("/console"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in could not be completed."); }
    finally { setBusy(false); }
  }

  async function createChallenge() {
    if (busy || externalBusy) return;
    const wallet = address.trim();
    setExternalError(""); setCopied(false);
    if (!isAddress(wallet)) { setExternalError("Enter a valid Ethereum address. Use only your public address, never a private key or recovery phrase."); return; }
    clearExternal();
    const requestVersion = version.current, abort = new AbortController();
    controller.current = abort; setExternalBusy("challenge");
    try {
      const response = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }), signal: abort.signal });
      const value = await response.json();
      if (requestVersion !== version.current) return;
      if (!response.ok) throw new Error(failureMessage(value, "Could not create a sign-in request."));
      if (!value || typeof value !== "object" || typeof value.challengeId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.challengeId) ||
          typeof value.message !== "string" || value.message.length > 4096 || value.message.split("\n")[1]?.toLowerCase() !== wallet.toLowerCase() ||
          typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)))
        throw new Error("The server returned an invalid sign-in challenge. Create a new request.");
      const remaining = Date.parse(value.expiresAt) - Date.now();
      if (remaining <= 0) throw new Error("The sign-in challenge expired. Create a new request.");
      setChallenge({ challengeId: value.challengeId, message: value.message, expiresAt: value.expiresAt, wallet });
    } catch (e) {
      if (requestVersion === version.current && !abort.signal.aborted)
        setExternalError(e instanceof Error ? e.message : "Could not create a sign-in request.");
    } finally {
      if (requestVersion === version.current) { setExternalBusy(null); controller.current = null; }
    }
  }

  async function copyMessage() {
    if (!challenge || expired || externalBusy === "verify") return;
    const requestVersion = version.current;
    try {
      await navigator.clipboard.writeText(challenge.message);
      if (requestVersion === version.current) setCopied(true);
    } catch {
      if (requestVersion === version.current) setExternalError("Clipboard access was unavailable. Select and copy the complete message exactly as displayed.");
    }
  }

  async function verifyExternal() {
    if (busy || externalBusy) return;
    setExternalError("");
    if (!challenge || challenge.wallet.toLowerCase() !== address.trim().toLowerCase()) {
      setExternalError("Create a sign-in challenge for the current public address."); return;
    }
    if (expired || Date.parse(challenge.expiresAt) <= Date.now()) { setExpired(true); setExternalError("The sign-in challenge expired. Create a new request."); return; }
    const signed = signature.trim();
    if (!/^0x[0-9a-fA-F]{130}$/.test(signed)) {
      setExternalError("Paste the 65-byte EIP-191 signature: 0x followed by 130 hexadecimal characters."); return;
    }
    const requestVersion = version.current, abort = new AbortController();
    controller.current = abort; setExternalBusy("verify");
    try {
      const response = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, signature: signed }), signal: abort.signal });
      const value = await response.json();
      if (requestVersion !== version.current) return;
      if (!response.ok) throw new Error(failureMessage(value, "Sign in could not be completed."));
      if (!value || typeof value !== "object" || value.authenticated !== true) throw new Error("The server did not confirm authentication. Create a new sign-in request.");
      router.push("/console"); router.refresh();
    } catch (e) {
      if (requestVersion === version.current && !abort.signal.aborted)
        setExternalError(e instanceof Error ? e.message : "Sign in could not be completed.");
    } finally {
      if (requestVersion === version.current) { setExternalBusy(null); controller.current = null; }
    }
  }

  return <main id="main" className="account-page">
    <Link href="/" className="wordmark">Countersign<span>↗</span></Link>
    <section className="account-card">
      <p className="eyebrow">YOUR WORKSPACE</p><h1>A clearer view of<br />what you owe.</h1>
      <p>Sign in with your wallet to create a private workspace. Start read-only. Your signature grants no access to your funds.</p>
      <button className="button primary" disabled={busy || externalBusy !== null} onClick={signIn}>{busy ? "Waiting for your wallet…" : "Sign in with Ethereum →"}</button>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="button" className="button secondary" aria-expanded={externalOpen} aria-controls="external-wallet" disabled={busy || externalBusy === "verify"} onClick={() => { clearExternal(); setError(""); setExternalOpen(!externalOpen); }}>Sign with an external wallet</button>
      {externalOpen && <form id="external-wallet" className="form-stack" onSubmit={event => { event.preventDefault(); void createChallenge(); }}>
        <p className="small-muted">Use OWS or another external EOA wallet. Enter only your public address. Keep private keys and recovery phrases in your wallet.</p>
        <label htmlFor="external-address">Public Ethereum address
          <input id="external-address" value={address} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} placeholder="0x…" disabled={busy || externalBusy === "verify"} onChange={event => { clearExternal(); setError(""); setAddress(event.target.value); }} />
        </label>
        <button type="submit" className="button secondary" disabled={busy || externalBusy !== null}>{externalBusy === "challenge" ? "Creating challenge…" : "Create sign-in challenge"}</button>
        {challenge && <>
          <label htmlFor="external-message">Exact sign-in message
            <textarea id="external-message" value={challenge.message} readOnly rows={13} spellCheck={false} />
          </label>
          <button type="button" className="button secondary" disabled={expired || externalBusy === "verify"} onClick={copyMessage}>Copy exact message</button>
          {copied && <p className="small-muted">Exact message copied.</p>}
          <p className="small-muted">Sign the complete message as UTF-8 text with EIP-191 (personal_sign) in your external wallet. Keep every line break; do not sign a transaction or a message hash. This signature grants no spending permission.</p>
          <p role="status">{expired ? "This challenge expired. Create a new sign-in challenge." : <>Challenge expires at <time dateTime={challenge.expiresAt}>{challenge.expiresAt}</time>. It can be used once.</>}</p>
          <label htmlFor="external-signature">EIP-191 signature
            <textarea id="external-signature" value={signature} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024} rows={3} disabled={expired || externalBusy === "verify"} placeholder="0x…" onChange={event => { setSignature(event.target.value); setExternalError(""); }} />
          </label>
          <button type="button" className="button primary" disabled={expired || externalBusy !== null} onClick={verifyExternal}>{externalBusy === "verify" ? "Verifying signature…" : "Complete sign-in"}</button>
        </>}
        {externalError && <p role="alert" className="form-error">{externalError}</p>}
      </form>}
      <div className="account-divider" /><p>No wallet needed to explore.</p>
      <Link href="/workspace" className="text-link">Try the interactive demo →</Link>
      <p className="small-muted">Workspace login currently supports EOA wallet signatures. Safe imports are read-only; signing authority stays with existing Safe owners.</p>
    </section>
    <Link href="/docs/security" className="text-link">How your data and permissions are protected</Link>
  </main>;
}
