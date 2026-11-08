-- Events are an auditable trigger source, and the idempotency key makes a
-- retried API call enrol at most once.
CREATE TABLE automation_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subscriber_id TEXT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  credential_id TEXT NOT NULL,
  idempotency_key TEXT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_automation_events_idempotency
  ON automation_events(credential_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_automation_events_name
  ON automation_events(name, created_at DESC);

CREATE INDEX idx_automation_events_subscriber
  ON automation_events(subscriber_id, created_at DESC);
