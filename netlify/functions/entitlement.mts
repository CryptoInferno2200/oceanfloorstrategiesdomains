import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

export default async () => {
  const user = await getUser();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return Response.json({ authenticated: false, complimentary: false, canManage: false }, { headers: { "Cache-Control": "no-store" } });
  const db = getDatabase();
  const [[eligible], [permission]] = await Promise.all([
    db.sql`SELECT email FROM identity_whitelist WHERE email = ${email}`,
    db.sql`SELECT role FROM identity_roles WHERE email = ${email} AND role = 'operator'`,
  ]);
  return Response.json({ authenticated: true, complimentary: Boolean(eligible), canManage: Boolean(permission) }, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/entitlement", method: "GET" };
