CREATE TABLE identity_roles (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO identity_roles (email, role)
VALUES ('oceanfloorstrategies2200@gmail.com', 'operator')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE ai_rate_limits (
  identity_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (identity_key, window_start)
);

CREATE INDEX ai_rate_limits_window_idx ON ai_rate_limits (window_start);
CREATE INDEX purchase_history_renewal_idx ON purchase_history (renews_at)
  WHERE renews_at IS NOT NULL AND status IN ('paid', 'complimentary');

ALTER TABLE purchase_history
  ADD CONSTRAINT purchase_history_plan_check
    CHECK (plan IN ('claim', 'one', 'abyss-one', 'tide', 'abyss', 'reef')) NOT VALID,
  ADD CONSTRAINT purchase_history_listing_check
    CHECK (listing IN ('web', 'web3', 'both')) NOT VALID,
  ADD CONSTRAINT purchase_history_status_check
    CHECK (status IN ('paid', 'complimentary', 'pending', 'refunded', 'canceled', 'zip-drop')) NOT VALID,
  ADD CONSTRAINT purchase_history_email_normalized_check
    CHECK (user_email = LOWER(TRIM(user_email)) AND user_email LIKE '%@%') NOT VALID,
  ADD CONSTRAINT purchase_history_fqdn_check
    CHECK (fqdn ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$') NOT VALID,
  ADD CONSTRAINT purchase_history_complimentary_amount_check
    CHECK (NOT complimentary OR amount_cents = 0) NOT VALID;

ALTER TABLE identity_whitelist
  ADD CONSTRAINT identity_whitelist_email_normalized_check
    CHECK (email = LOWER(TRIM(email)) AND email LIKE '%@%') NOT VALID;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_title_length_check
    CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 100) NOT VALID,
  ADD CONSTRAINT user_notifications_message_length_check
    CHECK (CHAR_LENGTH(message) BETWEEN 1 AND 1000) NOT VALID;
