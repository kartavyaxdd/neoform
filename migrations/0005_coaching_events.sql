-- Additive, owner-scoped coaching audit records. Existing history is untouched.
ALTER TABLE storage_heads ADD COLUMN coaching_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storage_uploads ADD COLUMN coaching_count INTEGER;
CREATE TABLE storage_coaching (
  owner TEXT NOT NULL REFERENCES storage_heads(owner) ON DELETE CASCADE,
  id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0),
  body TEXT NOT NULL,
  PRIMARY KEY(owner,id)
);
CREATE INDEX storage_coaching_order ON storage_coaching(owner,position,id);
CREATE TABLE storage_upload_coaching (
  owner TEXT NOT NULL,
  upload TEXT NOT NULL,
  id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
  position INTEGER,
  body TEXT,
  PRIMARY KEY(owner,upload,id),
  FOREIGN KEY(owner,upload) REFERENCES storage_uploads(owner,id) ON DELETE CASCADE
);
