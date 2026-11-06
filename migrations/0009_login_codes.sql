PRAGMA foreign_keys = ON;

-- A login row carries both the long magic-link token and a short, typed code.
-- Rows created before this migration keep code_hash NULL and stay usable
-- through the link only.
ALTER TABLE magic_links ADD COLUMN code_hash TEXT NULL;

CREATE INDEX idx_magic_links_code_hash ON magic_links(code_hash);
