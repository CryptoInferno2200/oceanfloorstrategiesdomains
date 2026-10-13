INSERT INTO identity_whitelist (email)
VALUES ('immortalcreationstx@gmail.com')
ON CONFLICT (email) DO NOTHING;
