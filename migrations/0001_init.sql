PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NULL,
  last_name TEXT NULL,
  status TEXT NOT NULL,
  source TEXT NULL,
  created_at INTEGER NOT NULL,
  unsubscribed_at INTEGER NULL,
  deleted_at INTEGER NULL
);

CREATE INDEX idx_subscribers_status_created ON subscribers(status, created_at);
CREATE INDEX idx_subscribers_deleted ON subscribers(deleted_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE subscriber_tags (
  subscriber_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (subscriber_id, tag_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriber_tags_tag ON subscriber_tags(tag_id, subscriber_id);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  ir_json TEXT NOT NULL,
  preview_html TEXT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  reply_to TEXT NULL,
  audience_query TEXT NOT NULL,
  scheduled_at INTEGER NULL,
  status TEXT NOT NULL,
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  audience_count INTEGER NULL,
  dispatch_cursor TEXT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER NULL,
  completed_at INTEGER NULL,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE RESTRICT
);

CREATE INDEX idx_campaigns_status_scheduled ON campaigns(status, scheduled_at);

CREATE TABLE campaign_recipients (
  campaign_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NULL,
  provider_message_id TEXT NULL,
  sent_at INTEGER NULL,
  opened_at INTEGER NULL,
  clicked_at INTEGER NULL,
  PRIMARY KEY (campaign_id, subscriber_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

CREATE INDEX idx_campaign_recipients_campaign_status ON campaign_recipients(campaign_id, status);
CREATE INDEX idx_campaign_recipients_subscriber ON campaign_recipients(subscriber_id);

CREATE TABLE link_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  url TEXT NOT NULL,
  link_id TEXT NULL,
  clicked_at INTEGER NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_link_clicks_campaign_subscriber ON link_clicks(campaign_id, subscriber_id);
CREATE INDEX idx_link_clicks_message ON link_clicks(message_id);

CREATE TABLE email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message_id TEXT NULL,
  email TEXT NULL,
  payload TEXT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_email_events_type_created ON email_events(type, created_at);
