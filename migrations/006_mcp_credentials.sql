ALTER TABLE oauth_authorization_codes
  ADD COLUMN IF NOT EXISTS discord_identity_id uuid NULL REFERENCES discord_identities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_oauth_authorization_codes_discord_identity_id
  ON oauth_authorization_codes (discord_identity_id);

CREATE TABLE IF NOT EXISTS mcp_credentials (
  id uuid PRIMARY KEY,
  discord_identity_id uuid NOT NULL REFERENCES discord_identities(id) ON DELETE CASCADE,
  oauth_client_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  last_used_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ix_mcp_credentials_identity_status_issued
  ON mcp_credentials (discord_identity_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS ix_mcp_credentials_status_issued
  ON mcp_credentials (status, issued_at DESC);
