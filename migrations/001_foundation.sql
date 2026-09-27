CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE members (organization_id uuid REFERENCES organizations(id), wallet text NOT NULL, role text NOT NULL CHECK(role IN ('owner','approver','operator','viewer')), PRIMARY KEY(organization_id,wallet));
CREATE TABLE auth_challenges (id uuid PRIMARY KEY, wallet text NOT NULL, message text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE sessions (token_hash text PRIMARY KEY, wallet text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits (key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL);
CREATE TABLE records (
 organization_id uuid NOT NULL REFERENCES organizations(id), kind text NOT NULL, id uuid NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 body jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,kind,id)
);
CREATE INDEX records_kind_idx ON records(organization_id,kind,created_at DESC);
CREATE TABLE record_versions (organization_id uuid NOT NULL, kind text NOT NULL,id uuid NOT NULL,version integer NOT NULL,body jsonb NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,kind,id,version),FOREIGN KEY(organization_id,kind,id) REFERENCES records(organization_id,kind,id));
CREATE TABLE audit_events (id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),actor text NOT NULL,action text NOT NULL,entity_id text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_org_idx ON audit_events(organization_id,created_at DESC);
CREATE TABLE documents (id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),filename text NOT NULL,mime text NOT NULL,byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 5242880),ciphertext bytea NOT NULL,iv bytea NOT NULL,tag bytea NOT NULL,commitment text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payment_intents (id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),invoice_id uuid NOT NULL,engagement_id uuid NOT NULL,idempotency_key text NOT NULL,amount numeric(78,0) NOT NULL CHECK(amount>0),state text NOT NULL CHECK(state IN ('prepared','capacity_reserved','authorized','submitted','uncertain','source_confirmed','destination_pending','settled','failed','recovery_required')),permit jsonb NOT NULL,provider_id text,source_tx text,destination_tx text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,idempotency_key));
CREATE UNIQUE INDEX active_invoice_payment ON payment_intents(organization_id,invoice_id) WHERE state NOT IN ('settled','failed');
CREATE TABLE outbox (id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),kind text NOT NULL,payload jsonb NOT NULL,dedupe_key text NOT NULL UNIQUE,available_at timestamptz NOT NULL DEFAULT now(),leased_until timestamptz,lease_token uuid,attempts integer NOT NULL DEFAULT 0,completed_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX outbox_pending ON outbox(available_at) WHERE completed_at IS NULL;
CREATE TABLE ledger_events (id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),payment_id uuid REFERENCES payment_intents(id),external_key text NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,external_key));
CREATE TABLE vendor_links (token_hash text PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),vendor_id uuid NOT NULL,case_id uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz);
CREATE TABLE intake_keys (token_hash text PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),label text NOT NULL,created_by text NOT NULL,revoked_at timestamptz);
CREATE TABLE intake_events (organization_id uuid NOT NULL REFERENCES organizations(id),external_id text NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,external_id));
-- Private server-only schema: no client database role has direct access. Defense in depth
-- against accidental future exposure through a hosted Data API.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations(version) VALUES ('001_foundation') ON CONFLICT DO NOTHING;
