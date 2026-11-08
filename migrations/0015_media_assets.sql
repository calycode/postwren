CREATE TABLE media_assets (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_media_assets_created ON media_assets(created_at DESC);
