-- Business sites served on customers' own names by the OFS web edge (server/powerdns/Caddyfile). One site per name.
CREATE TABLE hosted_sites (
  fqdn TEXT PRIMARY KEY CHECK (fqdn ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  user_email TEXT NOT NULL CHECK (user_email = LOWER(TRIM(user_email)) AND user_email LIKE '%@%'),
  business_name TEXT NOT NULL CHECK (CHAR_LENGTH(business_name) BETWEEN 1 AND 120),
  tagline TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(tagline) <= 160),
  description TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(description) <= 2000),
  contact_email TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(contact_email) <= 254),
  phone TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(phone) <= 40),
  location TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(location) <= 120),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX hosted_sites_user_idx ON hosted_sites (user_email);
