ALTER TABLE subscribers ADD COLUMN source_url TEXT NULL;

ALTER TABLE campaigns ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE subscriber_metadata (
  subscriber_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (subscriber_id, key),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriber_metadata_key_value ON subscriber_metadata(key, value);

CREATE TABLE subscribe_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_origins TEXT NOT NULL DEFAULT '[]',
  default_tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  revoked_at INTEGER NULL
);
