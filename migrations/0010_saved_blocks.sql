CREATE TABLE saved_blocks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  block_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_saved_blocks_updated ON saved_blocks(updated_at DESC);
