export const siteOrigin = (
  process.env.APP_ORIGIN || "https://countersign-jet.vercel.app"
).replace(/\/$/, "");
export const guideGroups = [
  "Start here",
  "Product guides",
  "Trust & control",
  "Build & operate",
  "Field notes",
] as const;
export type Guide = {
  slug: string;
  title: string;
  file: string;
  group: (typeof guideGroups)[number];
  description: string;
};
export const guides: Guide[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    file: "getting-started.md",
    group: "Start here",
    description:
      "Understand Countersign, explore the demo, and choose an adoption path.",
  },
  {
    slug: "release-status",
    title: "Release status",
    file: "FACTS.md",
    group: "Start here",
    description:
      "What is implemented, what is public, and what still requires activation.",
  },
  {
    slug: "glossary",
    title: "Concepts & glossary",
    file: "glossary.md",
    group: "Start here",
    description:
      "The language of obligations, decisions, authority, and settlement.",
  },
  {
    slug: "vendors",
    title: "Vendors & destinations",
    file: "vendors.md",
    group: "Product guides",
    description:
      "Vendor identity, approved destinations, and changes that need a fresh review.",
  },
  {
    slug: "agreements",
    title: "Agreements & acceptance",
    file: "agreements.md",
    group: "Product guides",
    description:
      "Versioned obligations, approved terms, and authorized acceptance.",
  },
  {
    slug: "invoices",
    title: "Invoices & exceptions",
    file: "invoices.md",
    group: "Product guides",
    description:
      "Document intake, duplicate checks, evidence, and vendor corrections.",
  },
  {
    slug: "verification",
    title: "Deterministic verification",
    file: "verification.md",
    group: "Product guides",
    description:
      "How invoices become eligible, held, or in need of clarification.",
  },
  {
    slug: "planning",
    title: "Cash & payment planning",
    file: "planning.md",
    group: "Product guides",
    description: "Confirmed cash, commitments, and shared-Safe scheduling.",
  },
  {
    slug: "payments",
    title: "Payments & reconciliation",
    file: "payments.md",
    group: "Product guides",
    description:
      "Stable payment identities, uncertain outcomes, and destination settlement.",
  },
  {
    slug: "automation",
    title: "Standing automation",
    file: "automation.md",
    group: "Product guides",
    description:
      "Observation history, bounded automation, durable work, and notifications.",
  },
  {
    slug: "accounting",
    title: "Accounting & exports",
    file: "accounting.md",
    group: "Product guides",
    description: "The subledger, CSV exports, and evidence for bookkeeping.",
  },
  {
    slug: "operations-desk",
    title: "Payment operations desk",
    file: "operations-desk.md",
    group: "Product guides",
    description:
      "Due dates, exception ownership, reminder preferences and accounting period packs.",
  },
  {
    slug: "receipts",
    title: "Receipts & verifier",
    file: "receipts.md",
    group: "Product guides",
    description:
      "Portable receipts, redaction, integrity verification, and offline limits.",
  },
  {
    slug: "security",
    title: "Security & permissions",
    file: "security.md",
    group: "Trust & control",
    description:
      "Observe, Prepare, Delegate, wallet identity, and exact constrained authority.",
  },
  {
    slug: "protection",
    title: "Reserved protection",
    file: "protection.md",
    group: "Trust & control",
    description:
      "Capped, fully reserved protection and its separate activation requirements.",
  },
  {
    slug: "recovery",
    title: "Recovery playbook",
    file: "recovery.md",
    group: "Trust & control",
    description:
      "Independent pause, revocation, uncertain operations, and safe recovery.",
  },
  {
    slug: "integrations",
    title: "Integrations",
    file: "integrations.md",
    group: "Build & operate",
    description: "Circle, Safe, CCTP, model extraction, and optional notices.",
  },
  {
    slug: "api",
    title: "API reference",
    file: "api.md",
    group: "Build & operate",
    description:
      "Authenticated endpoints, request examples, and error handling.",
  },
  {
    slug: "agents",
    title: "For AI agents",
    file: "agents.md",
    group: "Build & operate",
    description:
      "Machine-readable docs, retrieval guidance, and agent authority boundaries.",
  },
  {
    slug: "deployment",
    title: "Deploy & operate",
    file: "deployment.md",
    group: "Build & operate",
    description:
      "Persistence, encryption, migration, workers, and operational readiness.",
  },
  {
    slug: "activation",
    title: "Activate a real workspace",
    file: "activation.md",
    group: "Build & operate",
    description:
      "Redacted configuration diagnostics, read-only probes and exact external activation steps.",
  },
  {
    slug: "domain",
    title: "Domain reference",
    file: "domain.md",
    group: "Build & operate",
    description:
      "Core types, exact amounts, verification outcomes, and state machines.",
  },
  {
    slug: "security-review",
    title: "Security review notes",
    file: "security-review.md",
    group: "Trust & control",
    description:
      "Local review scope, findings, and independent review requirements.",
  },
  {
    slug: "contracts",
    title: "Contract controls",
    file: "contracts.md",
    group: "Build & operate",
    description:
      "Safe module constraints, route restrictions, and protection reserves.",
  },
  {
    slug: "relay",
    title: "Cross-chain relay",
    file: "relay.md",
    group: "Build & operate",
    description:
      "Durable destination submission and independently verified finality.",
  },
  {
    slug: "operations",
    title: "Operations reference",
    file: "operations.md",
    group: "Build & operate",
    description: "Observation, scoped overrides, and accounting operations.",
  },
  {
    slug: "evaluation",
    title: "Evidence & evaluation",
    file: "evaluation.md",
    group: "Build & operate",
    description:
      "Compare workflows without mixing synthetic and independent evidence.",
  },
  {
    slug: "why-countersign",
    title: "Why Countersign?",
    file: "why-countersign.md",
    group: "Field notes",
    description:
      "When agreement-aware payment review is useful—and when it is not.",
  },
  {
    slug: "start-read-only",
    title: "Start with read-only",
    file: "start-read-only.md",
    group: "Field notes",
    description:
      "A practical route from visibility to justified, bounded automation.",
  },
  {
    slug: "agreement-aware-payments",
    title: "Beyond the invoice",
    file: "agreement-aware-payments.md",
    group: "Field notes",
    description:
      "Why terms, delivery, acceptance, and history belong in one decision.",
  },
  {
    slug: "settlement-is-not-a-hash",
    title: "Settlement is not a hash",
    file: "settlement-is-not-a-hash.md",
    group: "Field notes",
    description:
      "Why a submitted transfer needs independent destination confirmation.",
  },
];
export function findGuide(slug: string) {
  return guides.find((guide) => guide.slug === slug);
}
