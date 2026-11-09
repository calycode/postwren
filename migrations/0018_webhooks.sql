PRAGMA foreign_keys = ON;

-- Endpoints are user-configured; the signing secret has to stay readable
-- because the Worker signs every delivery with it. Only API keys are hashed.
CREATE TABLE webhook_endpoints (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events_json TEXT NOT NULL,
  description TEXT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_success_at INTEGER NULL,
  last_failure_at INTEGER NULL,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_webhook_endpoints_enabled ON webhook_endpoints(enabled, created_at);

-- A delivery is written before the HTTP call so a failed send survives a Worker
-- restart and can be retried by the cron sweep.
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER NULL,
  error TEXT NULL,
  next_attempt_at INTEGER NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER NULL,
  FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);
