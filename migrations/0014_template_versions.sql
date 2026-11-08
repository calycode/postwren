CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  ir_json TEXT NOT NULL,
  preview_html TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_template_versions_template_revision
  ON template_versions(template_id, revision);

CREATE INDEX idx_template_versions_template_created
  ON template_versions(template_id, created_at DESC);
