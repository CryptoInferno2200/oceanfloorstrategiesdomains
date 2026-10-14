-- One row per chat upload so storage can be capped per person and expired uploads cleaned up.
CREATE TABLE chat_uploads (
  id UUID PRIMARY KEY,
  owner TEXT NOT NULL,
  size BIGINT NOT NULL CHECK (size > 0),
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_uploads_owner_idx ON chat_uploads (owner, created_at);
CREATE INDEX chat_uploads_created_idx ON chat_uploads (created_at);
