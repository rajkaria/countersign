"use client";
import Link from "next/link";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="account-page">
      <section className="account-card">
        <p className="eyebrow">WORKSPACE UNAVAILABLE</p>
        <h1>Let’s try that again.</h1>
        <p>
          The sample workspace could not finish loading. Your saved browser
          records have not been intentionally changed.
        </p>
        <button className="button" onClick={reset}>
          Retry workspace
        </button>
        <Link className="text-link" href="/">
          Return to Countersign →
        </Link>
      </section>
    </main>
  );
}
