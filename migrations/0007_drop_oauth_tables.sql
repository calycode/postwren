-- The OAuth server moved to @cloudflare/workers-oauth-provider, which stores
-- grants, codes and hashed tokens in OAUTH_KV. Drop the tables created by the
-- earlier hand-rolled implementation. Fresh databases get a no-op.
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS oauth_grants;
DROP TABLE IF EXISTS oauth_clients;
