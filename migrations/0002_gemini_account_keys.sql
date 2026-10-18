PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS account_ai_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- No user FK: removing an account must not prematurely free an upstream lease.
CREATE TABLE IF NOT EXISTS ai_generation_lock (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1))
);
