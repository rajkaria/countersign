import type { MigrationRequirements } from "./activation";

// Bundled for serverless probes. A parity test compares this to every shipped SQL migration.
export const migrationRequirements: MigrationRequirements = {
  versions: [
    "001_foundation",
    "002_security_controls",
    "003_relay",
    "004_access_metadata",
    "005_notice_delivery",
  ],
  tables: [
    "audit_events",
    "auth_challenges",
    "destination_changes",
    "destination_relays",
    "documents",
    "intake_events",
    "intake_keys",
    "ledger_events",
    "members",
    "notification_deliveries",
    "organizations",
    "outbox",
    "payment_intents",
    "rate_limits",
    "record_versions",
    "records",
    "schema_migrations",
    "sessions",
    "vendor_links",
  ],
  columns: {
    payment_intents: [
      "invalidated_at",
      "invalidation_reason",
      "terminal_failure_proof",
      "source_confirmed_at",
      "settled_at",
    ],
    vendor_links: ["id", "created_at"],
    intake_keys: ["id", "created_at"],
  },
};
