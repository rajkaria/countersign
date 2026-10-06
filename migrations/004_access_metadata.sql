-- Public administrative identifiers allow revocation without exposing token hashes.
ALTER TABLE vendor_links ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE vendor_links ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX vendor_links_id ON vendor_links(id);
ALTER TABLE intake_keys ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE intake_keys ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX intake_keys_id ON intake_keys(id);
INSERT INTO schema_migrations(version) VALUES ('004_access_metadata') ON CONFLICT DO NOTHING;
