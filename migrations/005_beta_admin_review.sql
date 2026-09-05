CREATE TABLE IF NOT EXISTS beta_access_decisions (
  id uuid PRIMARY KEY,
  beta_access_request_id uuid NOT NULL REFERENCES beta_access_requests(id) ON DELETE CASCADE,
  admin_discord_identity_id uuid NOT NULL REFERENCES discord_identities(id) ON DELETE RESTRICT,
  from_status text NOT NULL CHECK (from_status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
  to_status text NOT NULL CHECK (to_status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_beta_access_decisions_request_created
  ON beta_access_decisions (beta_access_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_beta_access_decisions_admin_created
  ON beta_access_decisions (admin_discord_identity_id, created_at DESC);
