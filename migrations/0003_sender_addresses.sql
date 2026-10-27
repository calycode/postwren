CREATE TABLE sender_addresses (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL,
  verified_at INTEGER NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX sender_addresses_domain ON sender_addresses(domain);
