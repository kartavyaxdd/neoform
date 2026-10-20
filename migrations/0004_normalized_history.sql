-- Additive only. Original account_data/public_workspace rows remain untouched
-- as migration-source snapshots. No credentials or personal records are copied
-- by the migration itself; conversion occurs for one authorized owner at a time.
CREATE TABLE storage_heads (
  owner TEXT PRIMARY KEY,
  private_user TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  body TEXT NOT NULL,
  session_count INTEGER NOT NULL CHECK(session_count BETWEEN 0 AND 50000),
  attempt TEXT NOT NULL
);
CREATE TABLE storage_history (
  owner TEXT NOT NULL REFERENCES storage_heads(owner) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY(owner,id)
);
CREATE INDEX storage_history_position ON storage_history(owner,position,id);
CREATE TABLE storage_receipts (
  owner TEXT NOT NULL REFERENCES storage_heads(owner) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY(owner,id)
);
CREATE TABLE storage_uploads (
  owner TEXT NOT NULL REFERENCES storage_heads(owner) ON DELETE CASCADE,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  session_count INTEGER NOT NULL,
  part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 1024),
  checksum TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,id)
);
CREATE TABLE storage_upload_headers (
  owner TEXT NOT NULL, upload TEXT NOT NULL, body TEXT NOT NULL,
  PRIMARY KEY(owner,upload),
  FOREIGN KEY(owner,upload) REFERENCES storage_uploads(owner,id) ON DELETE CASCADE
);
CREATE TABLE storage_upload_parts (
  owner TEXT NOT NULL, upload TEXT NOT NULL, part INTEGER NOT NULL, hash TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes >= 0), records INTEGER NOT NULL CHECK(records >= 0),
  PRIMARY KEY(owner,upload,part),
  FOREIGN KEY(owner,upload) REFERENCES storage_uploads(owner,id) ON DELETE CASCADE
);
-- Atomic owner-wide staging budget; concurrent parts cannot overbook it.
CREATE TRIGGER storage_staging_budget BEFORE INSERT ON storage_upload_parts
BEGIN
  SELECT CASE WHEN
    (SELECT COALESCE(SUM(bytes),0) FROM storage_upload_parts WHERE owner=NEW.owner) + NEW.bytes > 100000000
    OR (SELECT COALESCE(SUM(records),0) FROM storage_upload_parts WHERE owner=NEW.owner) + NEW.records > 100000
    THEN RAISE(ABORT,'neoform_staging_quota') END;
END;
CREATE TABLE storage_upload_records (
  owner TEXT NOT NULL, upload TEXT NOT NULL, id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
  position INTEGER, body TEXT,
  PRIMARY KEY(owner,upload,id),
  FOREIGN KEY(owner,upload) REFERENCES storage_uploads(owner,id) ON DELETE CASCADE
);
CREATE INDEX storage_upload_positions ON storage_upload_records(owner,upload,position);
