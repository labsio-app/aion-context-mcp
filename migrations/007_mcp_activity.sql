CREATE TABLE IF NOT EXISTS mcp_activities (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  credential_id uuid NULL REFERENCES mcp_credentials(id) ON DELETE SET NULL,
  authentication_method text NOT NULL CHECK (authentication_method IN ('OAUTH', 'LEGACY_OAUTH')),
  tool_name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  duration_ms integer NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_mcp_activities_user_created
  ON mcp_activities (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_mcp_activities_credential_created
  ON mcp_activities (credential_id, created_at DESC, id DESC);
