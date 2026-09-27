import Link from "next/link";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="Countersign home"
    >
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
      </span>
      Countersign
    </Link>
  );
}
export function SiteHeader() {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="Main navigation">
        <Link href="/#workflow">How it works</Link>
        <Link href="/#control">Your control</Link>
        <Link href="/docs">Documentation</Link>
      </nav>
      <Link href="/workspace" className="button button-small">
        Explore the demo <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>A second look. A better payment.</p>
      </div>
      <div>
        <Link href="/docs">Documentation</Link>
        <Link href="/docs/security">Security & control</Link>
        <Link href="/docs/getting-started">Get started</Link>
      </div>
      <span>© {new Date().getFullYear()} Countersign</span>
    </footer>
  );
}
