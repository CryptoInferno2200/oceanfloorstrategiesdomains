CREATE TABLE sauce_launches (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  user_email TEXT NOT NULL CHECK (user_email = LOWER(TRIM(user_email)) AND user_email LIKE '%@%'),
  fqdn TEXT NOT NULL CHECK (fqdn ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  problem TEXT NOT NULL CHECK (CHAR_LENGTH(problem) BETWEEN 1 AND 1200),
  audience TEXT NOT NULL DEFAULT '',
  brief JSONB NOT NULL,
  logo_key TEXT,
  plan TEXT NOT NULL DEFAULT 'one' CHECK (plan = 'one'),
  revenue_share_pct INTEGER NOT NULL DEFAULT 50 CHECK (revenue_share_pct = 50),
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting-payment' CHECK (status IN ('awaiting-payment', 'published')),
  checkout_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX sauce_launches_user_idx ON sauce_launches (user_email, created_at DESC);
