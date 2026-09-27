-- High-risk changes are authenticated, version-bound, and independently confirmed.
ALTER TABLE payment_intents ADD COLUMN invalidated_at timestamptz;
ALTER TABLE payment_intents ADD COLUMN invalidation_reason text;
ALTER TABLE payment_intents ADD COLUMN terminal_failure_proof text;
ALTER TABLE payment_intents ADD COLUMN source_confirmed_at timestamptz;
ALTER TABLE payment_intents ADD COLUMN settled_at timestamptz;
CREATE INDEX payment_policy_capacity ON payment_intents(organization_id,engagement_id,state);
CREATE TABLE destination_changes (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 vendor_id uuid NOT NULL,
 expected_version integer NOT NULL CHECK(expected_version>0),
 previous_destination text NOT NULL,
 previous_chain_id bigint NOT NULL CHECK(previous_chain_id>0),
 destination text NOT NULL,
 chain_id bigint NOT NULL CHECK(chain_id>0),
 reason text NOT NULL,
 proposed_by text NOT NULL,
 proposer_session_hash text NOT NULL,
 solo_exception_reason text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','superseded')),
 confirmed_by text,
 confirmed_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX destination_change_pending ON destination_changes(organization_id,vendor_id) WHERE status='pending';
ALTER TABLE destination_changes ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations(version) VALUES ('002_security_controls') ON CONFLICT DO NOTHING;
