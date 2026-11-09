-- Double opt-in is opt-in per subscribe key, so existing keys keep the immediate
-- signup behaviour. `confirmed_at` also gives the audience a way to tell a
-- confirmed reader from a legacy imported row.
ALTER TABLE subscribe_keys ADD COLUMN require_confirmation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN confirmed_at INTEGER NULL;

CREATE INDEX idx_subscribers_confirmed ON subscribers(confirmed_at);
