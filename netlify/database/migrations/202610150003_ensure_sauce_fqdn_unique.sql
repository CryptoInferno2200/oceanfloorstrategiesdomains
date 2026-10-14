-- 202610140002 skipped the unique fqdn index when older launches already shared a name.
-- Retry it; if duplicates still exist, at least make published names unique (checkout rejects taken unpublished names).
-- Never rewrites rows, so it is safe on existing data and idempotent.
DO $$
BEGIN
  IF to_regclass('sauce_launches_fqdn_key') IS NOT NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT fqdn FROM sauce_launches GROUP BY fqdn HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS sauce_launches_fqdn_key ON sauce_launches (fqdn);
    RETURN;
  END IF;
  CREATE INDEX IF NOT EXISTS sauce_launches_fqdn_idx ON sauce_launches (fqdn);
  IF NOT EXISTS (SELECT fqdn FROM sauce_launches WHERE status = 'published' GROUP BY fqdn HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS sauce_launches_published_fqdn_key ON sauce_launches (fqdn) WHERE status = 'published';
  ELSE
    RAISE WARNING 'sauce_launches has published launches sharing a name; resolve them, then rerun this check.';
  END IF;
END $$;
