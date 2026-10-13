CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL CHECK (user_email = LOWER(TRIM(user_email)) AND user_email LIKE '%@%'),
  fqdn TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'one',
  listing TEXT NOT NULL DEFAULT 'both',
  stage TEXT NOT NULL DEFAULT 'in-development',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, fqdn)
);

CREATE INDEX projects_user_updated_idx ON projects (user_email, updated_at DESC);
