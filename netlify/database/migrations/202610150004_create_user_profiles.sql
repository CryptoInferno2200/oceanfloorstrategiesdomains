-- One saved profile per account. The avatar image lives in the "profile-avatars" blob store under avatar_key.
CREATE TABLE user_profiles (
  user_email TEXT PRIMARY KEY,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  avatar_key TEXT,
  avatar_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
