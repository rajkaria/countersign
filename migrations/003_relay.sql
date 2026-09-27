CREATE UNIQUE INDEX payment_tenant_identity ON payment_intents(id,organization_id);
CREATE TABLE destination_relays (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 payment_id uuid NOT NULL UNIQUE,
 source_tx text NOT NULL,
 permit_digest text NOT NULL,
 configuration_digest text NOT NULL,
 destination_chain_id bigint NOT NULL CHECK(destination_chain_id>0),
 destination_transmitter text NOT NULL,
 destination_wallet text NOT NULL,
 message_hash text,
 message text,
 attestation text,
 state text NOT NULL DEFAULT 'attestation_pending' CHECK(state IN ('attestation_pending','prepared','submitting','submitted','uncertain','recovery_required','settled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 1),
 provider_id text,
 transaction_hash text,
 attached_by text,
 attached_reason text,
 submitted_at timestamptz,
 confirmed_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(payment_id,organization_id) REFERENCES payment_intents(id,organization_id)
);
CREATE INDEX relay_pending ON destination_relays(organization_id,state) WHERE state<>'settled';
ALTER TABLE destination_relays ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations(version) VALUES ('003_relay') ON CONFLICT DO NOTHING;
