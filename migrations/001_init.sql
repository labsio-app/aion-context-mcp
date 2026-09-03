CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('YOUTUBE', 'WEB', 'MANUAL')),
  url text NULL,
  title text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('GLOBAL', 'TW', 'KR', 'UNKNOWN')),
  content text NOT NULL DEFAULT '',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sources_title_trgm
  ON sources USING gin (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_sources_fts
  ON sources USING gin (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(notes,''))
  );

CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('OBSERVATION', 'CLAIM', 'THEORY', 'RECOMMENDATION')),
  statement text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('GLOBAL', 'TW', 'KR', 'UNKNOWN')),
  confidence text NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'CHALLENGED', 'SUPERSEDED')),
  applicability text NULL,
  notes text NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_knowledge_statement_trgm
  ON knowledge_items USING gin (lower(statement) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  knowledge_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  PRIMARY KEY (knowledge_id, source_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY,
  knowledge_id uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  objection text NOT NULL,
  source_id uuid NULL REFERENCES sources(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_challenges_knowledge_status
  ON challenges (knowledge_id, status);

CREATE TABLE IF NOT EXISTS acquisition_jobs (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('FETCH_SOURCE')),
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  payload jsonb NOT NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_acquisition_jobs_status_created
  ON acquisition_jobs (status, created_at);

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
