-- Provider-agnostic sending. One row per provider; exactly one row is the
-- workspace default. API keys and webhook signing secrets are AES-GCM
-- ciphertext, never plaintext, so a D1 dump does not leak credentials.
CREATE TABLE email_providers (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  api_key_ciphertext TEXT NULL,
  api_key_last4 TEXT NULL,
  webhook_secret_ciphertext TEXT NULL,
  webhook_token TEXT NOT NULL UNIQUE,
  from_domain TEXT NULL,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_email_providers_default
  ON email_providers(is_default)
  WHERE is_default = 1;

-- Campaigns freeze the provider when they are scheduled, next to the IR
-- snapshot. A late bounce must resolve to the provider that actually sent it.
ALTER TABLE campaigns ADD COLUMN provider TEXT NOT NULL DEFAULT 'cloudflare';

-- Raw provider event type stays in `type` for audit; `kind` is the normalised
-- vocabulary the suppression policy branches on.
ALTER TABLE email_events ADD COLUMN provider TEXT NOT NULL DEFAULT 'cloudflare';
ALTER TABLE email_events ADD COLUMN kind TEXT NULL;
