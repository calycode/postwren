PRAGMA foreign_keys = ON;

CREATE TABLE template_comments (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_template_comments_template
  ON template_comments(template_id, status, created_at);

CREATE INDEX idx_template_comments_block
  ON template_comments(template_id, block_id);
