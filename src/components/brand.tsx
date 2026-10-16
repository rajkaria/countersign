import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={"brand " + (light ? "brand-light" : "")}
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
      <nav className="site-desktop-nav" aria-label="Main navigation">
        <Link href="/#workflow">How it works</Link>
        <Link href="/#control">Your control</Link>
        <Link href="/docs">Documentation</Link>
        <Link href="/login">
          Sign in <ArrowUpRight size={13} />
        </Link>
      </nav>
      <Link href="/review" className="button button-small header-demo">
        Explore the demo <ArrowUpRight size={15} />
      </Link>
      <details className="site-mobile-menu">
        <summary aria-label="Open navigation">
          <Menu size={22} />
        </summary>
        <nav aria-label="Mobile main navigation">
          <Link href="/#workflow">How it works</Link>
          <Link href="/#control">Your control</Link>
          <Link href="/docs">Documentation</Link>
          <Link href="/review">
            Explore the demo <ArrowUpRight size={15} />
          </Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </details>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Brand />
        <p>Every payment deserves the full picture.</p>
      </div>
      <div>
        <Link href="/docs">Handbook</Link>
        <Link href="/docs/security">Security & control</Link>
        <Link href="/docs/getting-started">Get started</Link>
        <Link href="/review">Product walkthrough</Link>
      </div>
      <span>© {new Date().getFullYear()} Countersign</span>
    </footer>
  );
}
