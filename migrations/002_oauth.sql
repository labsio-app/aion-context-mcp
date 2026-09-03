CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code text PRIMARY KEY,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL CHECK (code_challenge_method = 'S256'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_oauth_authorization_codes_expires_at
  ON oauth_authorization_codes (expires_at);
