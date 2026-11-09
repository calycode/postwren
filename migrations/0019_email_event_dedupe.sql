-- Cloudflare can deliver the same Email Sending event more than once. The
-- event id makes processing idempotent without relying on message/recipient
-- uniqueness, which repeats for deferred events.
ALTER TABLE email_events ADD COLUMN event_id TEXT NULL;

CREATE UNIQUE INDEX idx_email_events_event_id
  ON email_events(event_id)
  WHERE event_id IS NOT NULL;
