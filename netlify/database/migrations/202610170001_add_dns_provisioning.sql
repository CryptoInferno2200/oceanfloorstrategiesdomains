-- Registered names get a zone on the OFS PowerDNS server and OFS nameservers at the registrar; this tracks that step.
ALTER TABLE domain_registrations
  ADD COLUMN IF NOT EXISTS dns_status TEXT NOT NULL DEFAULT 'pending' CHECK (dns_status IN ('pending', 'active', 'failed')),
  ADD COLUMN IF NOT EXISTS dns_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dns_error TEXT,
  ADD COLUMN IF NOT EXISTS dns_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS domain_registrations_dns_pending_idx ON domain_registrations (dns_updated_at)
  WHERE status = 'registered' AND dns_status = 'pending';
