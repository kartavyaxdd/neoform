-- Separate, opt-in shared state. Never references or copies private accounts.
CREATE TABLE public_workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
