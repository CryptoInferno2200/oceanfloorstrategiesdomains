-- Every email the operator has ever whitelisted, kept after removal so the back office can show and restore it.
CREATE TABLE identity_whitelist_history (
  email TEXT PRIMARY KEY CHECK (email = LOWER(TRIM(email)) AND email LIKE '%@%'),
  first_added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);

INSERT INTO identity_whitelist_history (email, first_added_at, last_added_at)
SELECT email, created_at, created_at FROM identity_whitelist
ON CONFLICT (email) DO NOTHING;
