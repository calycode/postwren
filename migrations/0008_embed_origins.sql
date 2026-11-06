PRAGMA foreign_keys = ON;

-- Exact origins that may frame the admin SPA. Empty means only this Worker's
-- own origin. Stored normalised (scheme + host + port, no path) by the API.
CREATE TABLE embed_origins (
  origin TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_embed_origins_created ON embed_origins(created_at);
