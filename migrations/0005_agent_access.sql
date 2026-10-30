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

CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  grant_types TEXT NOT NULL DEFAULT '["authorization_code","refresh_token"]',
  response_types TEXT NOT NULL DEFAULT '["code"]',
  scope TEXT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER NULL,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_oauth_grants_client_user ON oauth_grants(client_id, user_id);
CREATE INDEX idx_oauth_grants_revoked ON oauth_grants(revoked_at);

CREATE TABLE oauth_tokens (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_type TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  audience TEXT NOT NULL,
  redirect_uri TEXT NULL,
  code_challenge TEXT NULL,
  code_challenge_method TEXT NULL,
  rotated_from TEXT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER NULL,
  revoked_at INTEGER NULL,
  FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_oauth_tokens_grant ON oauth_tokens(grant_id);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(expires_at);
CREATE INDEX idx_oauth_tokens_type_hash ON oauth_tokens(token_type, token_hash);
