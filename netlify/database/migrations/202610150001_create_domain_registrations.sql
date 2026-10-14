-- Paid names are registered at Porkbun after payment; this tracks each one through retries.
CREATE TABLE domain_registrations (
  purchase_id TEXT PRIMARY KEY REFERENCES purchase_history (id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  fqdn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'retrying', 'registered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  registrar_order_id TEXT,
  cost_cents INTEGER,
  last_attempt_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX domain_registrations_pending_idx ON domain_registrations (status, last_attempt_at)
  WHERE status IN ('queued', 'retrying');
CREATE INDEX domain_registrations_user_idx ON domain_registrations (user_email);
