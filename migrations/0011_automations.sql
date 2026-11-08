CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_type TEXT NOT NULL,
  trigger_config_json TEXT NOT NULL DEFAULT '{}',
  entry_query TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  activated_at INTEGER NULL
);

CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  automation_version INTEGER NOT NULL,
  subscriber_id TEXT NOT NULL,
  status TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  entered_at INTEGER NOT NULL,
  completed_at INTEGER NULL,
  exit_reason TEXT NULL,
  last_error TEXT NULL,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_automation_runs_active
  ON automation_runs(automation_id, subscriber_id)
  WHERE status IN ('waiting', 'running');

CREATE INDEX idx_automation_runs_due
  ON automation_runs(status, next_run_at);

CREATE TABLE automation_deliveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_revision INTEGER NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT NULL,
  sent_at INTEGER NULL,
  opened_at INTEGER NULL,
  clicked_at INTEGER NULL,
  error_code TEXT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX idx_automation_deliveries_run ON automation_deliveries(run_id, created_at);
CREATE INDEX idx_automation_deliveries_automation ON automation_deliveries(automation_id, created_at);

CREATE TABLE automation_link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  url TEXT NOT NULL,
  link_id TEXT NULL,
  clicked_at INTEGER NOT NULL,
  FOREIGN KEY (delivery_id) REFERENCES automation_deliveries(id) ON DELETE CASCADE
);

CREATE INDEX idx_automation_link_clicks_delivery ON automation_link_clicks(delivery_id);
