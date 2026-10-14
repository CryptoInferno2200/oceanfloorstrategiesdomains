-- Each Sauce launch owns its name. Skip creating the index if older rows already share a name, so the deploy never fails.
DO $$
BEGIN
  IF NOT EXISTS (SELECT fqdn FROM sauce_launches GROUP BY fqdn HAVING COUNT(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS sauce_launches_fqdn_key ON sauce_launches (fqdn);
  END IF;
END $$;

