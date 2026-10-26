-- Credentials stay separate from shared training state, exports and private-account keys.
CREATE TABLE profile_ai_keys (
 profile_id TEXT PRIMARY KEY REFERENCES workspace_profiles(id) ON DELETE CASCADE,
 encrypted TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 verified_at INTEGER
);
