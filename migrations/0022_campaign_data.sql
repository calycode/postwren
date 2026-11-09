-- Structured campaign data for repeat blocks. The snapshot freezes the payload
-- at schedule/send time, just like ir_snapshot and metadata_snapshot.
ALTER TABLE campaigns ADD COLUMN data_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN data_snapshot TEXT NULL;
