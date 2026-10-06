-- A provider timeout must not trigger an automatic repeat message.
CREATE TABLE notification_deliveries (
 organization_id uuid NOT NULL REFERENCES organizations(id), event_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('sending','sent','uncertain')),
 provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,event_id)
);
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
INSERT INTO schema_migrations(version) VALUES ('005_notice_delivery') ON CONFLICT DO NOTHING;
