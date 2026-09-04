CREATE TABLE IF NOT EXISTS discord_identities (
  id uuid PRIMARY KEY,
  discord_user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  global_name text NULL,
  avatar text NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_discord_identities_display_name_trgm
  ON discord_identities USING gin (lower(display_name) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS discord_browser_sessions (
  id uuid PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES discord_identities(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_discord_browser_sessions_identity_id
  ON discord_browser_sessions (identity_id);

CREATE INDEX IF NOT EXISTS ix_discord_browser_sessions_expires_at
  ON discord_browser_sessions (expires_at);
