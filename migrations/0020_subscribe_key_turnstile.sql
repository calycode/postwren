-- A non-empty site key turns Turnstile on for that subscribe key. The matching
-- secret is a Worker secret because it must never reach the browser.
ALTER TABLE subscribe_keys ADD COLUMN turnstile_site_key TEXT NULL;
