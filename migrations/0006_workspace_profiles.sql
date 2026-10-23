-- Additive profile access only. Existing training data keeps its original owner.
CREATE TABLE workspace_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL UNIQUE,
  locked INTEGER NOT NULL CHECK(locked IN (0,1)),
  pass_hash TEXT,
  salt TEXT
);
INSERT INTO workspace_profiles(id,name,owner,locked) VALUES
  ('sharma','Sharma','public-workspace',1),
  ('abhishek','Abhishek','profile:abhishek',0);
CREATE TABLE workspace_profile_sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES workspace_profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX workspace_profile_expiry ON workspace_profile_sessions(expires_at);
