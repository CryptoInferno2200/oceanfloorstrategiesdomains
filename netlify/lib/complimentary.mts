import { getDatabase } from "@netlify/database";

// Whitelisted seats and the operator (the builder) are never charged, even if the operator is removed from the whitelist.
export async function isComplimentary(email: string) {
  if (!email) return false;
  const [row] = await getDatabase().sql`
    SELECT 1 AS found
    WHERE EXISTS (SELECT 1 FROM identity_whitelist WHERE email = ${email})
       OR EXISTS (SELECT 1 FROM identity_roles WHERE email = ${email} AND role = 'operator')
  `;
  return Boolean(row);
}

// A complimentary claim still goes through when the registrar is down or not configured yet; the name stays queued.
export const registrarUnreachable = (status: number) => status === 502 || status === 503;
