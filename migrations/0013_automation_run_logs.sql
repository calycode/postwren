-- Run logging: enough detail to see how long a run took, how much work it did,
-- and where it stalled, without a second observability pipeline.
ALTER TABLE automation_runs ADD COLUMN started_at INTEGER NULL;
ALTER TABLE automation_runs ADD COLUMN last_step_at INTEGER NULL;
ALTER TABLE automation_runs ADD COLUMN steps_executed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_runs ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_runs ADD COLUMN idempotency_key TEXT NULL;

-- Deliveries are the observable output of a run, so they carry their step index
-- and timing next to the run id that produced them.
ALTER TABLE automation_deliveries ADD COLUMN step_index INTEGER NULL;
ALTER TABLE automation_deliveries ADD COLUMN queued_at INTEGER NULL;
ALTER TABLE automation_deliveries ADD COLUMN duration_ms INTEGER NULL;

CREATE UNIQUE INDEX idx_automation_runs_idempotency
  ON automation_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_automation_runs_automation_entered
  ON automation_runs(automation_id, entered_at DESC);
