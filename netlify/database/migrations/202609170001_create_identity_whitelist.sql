CREATE TABLE identity_whitelist (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO identity_whitelist (email)
VALUES ('oceanfloorstrategies2200@gmail.com')
ON CONFLICT (email) DO NOTHING;
