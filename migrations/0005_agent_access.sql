PRAGMA foreign_keys = ON;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NULL,
  expires_at INTEGER NULL,
  revoked_at INTEGER NULL
);

CREATE INDEX idx_api_keys_created ON api_keys(created_at);
CREATE INDEX idx_api_keys_revoked ON api_keys(revoked_at);
