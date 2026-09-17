CREATE TABLE purchase_history (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  fqdn TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL,
  label TEXT NOT NULL,
  listing TEXT NOT NULL DEFAULT 'both',
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  complimentary BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'paid',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  renews_at TIMESTAMPTZ
);

CREATE INDEX purchase_history_user_date_idx
  ON purchase_history (user_email, purchased_at DESC);

CREATE TABLE user_notifications (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_email TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_notifications_target_date_idx
  ON user_notifications (target_email, created_at DESC);
