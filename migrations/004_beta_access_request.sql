CREATE TABLE IF NOT EXISTS beta_access_requests (
  id uuid PRIMARY KEY,
  discord_identity_id uuid NOT NULL REFERENCES discord_identities(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  motivation text NOT NULL,
  intended_usage text NOT NULL,
  aion_profile text NULL,
  expected_clients text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_beta_access_requests_active_identity
  ON beta_access_requests (discord_identity_id)
  WHERE status IN ('PENDING', 'APPROVED');

CREATE INDEX IF NOT EXISTS ix_beta_access_requests_identity_status_created
  ON beta_access_requests (discord_identity_id, status, created_at DESC);
