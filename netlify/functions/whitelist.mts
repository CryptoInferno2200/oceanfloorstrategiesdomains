import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  const db = getDatabase();
  const [permission] = email ? await db.sql`SELECT role FROM identity_roles WHERE email = ${email} AND role = 'operator'` : [];
  if (!permission) {
    return Response.json({ error: "Operator access required." }, { status: 403 });
  }

  if (request.method === "GET") {
    // Every email ever listed: active entries can be removed, removed ones can be restored.
    const rows = await db.sql`
      SELECT h.email, h.first_added_at, h.last_added_at, h.removed_at,
             (w.email IS NOT NULL) AS active,
             EXISTS (SELECT 1 FROM identity_roles r WHERE r.email = h.email AND r.role = 'operator') AS operator
      FROM identity_whitelist_history h
      LEFT JOIN identity_whitelist w ON w.email = h.email
      ORDER BY (w.email IS NOT NULL) DESC, h.last_added_at DESC
    `;
    return Response.json({ whitelist: rows }, { headers: { "Cache-Control": "no-store" } });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const invitedEmail = normalize(body.email);
    if (!validEmail(invitedEmail)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    await db.sql`
      INSERT INTO identity_whitelist (email) VALUES (${invitedEmail})
      ON CONFLICT (email) DO NOTHING
    `;
    await db.sql`
      INSERT INTO identity_whitelist_history (email) VALUES (${invitedEmail})
      ON CONFLICT (email) DO UPDATE SET last_added_at = NOW(), removed_at = NULL
    `;
    return Response.json({ email: invitedEmail }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const invitedEmail = normalize(new URL(request.url).searchParams.get("email"));
    if (!validEmail(invitedEmail)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    const [protectedRole] = await db.sql`SELECT role FROM identity_roles WHERE email = ${invitedEmail} AND role = 'operator'`;
    if (protectedRole) return Response.json({ error: "The operator cannot be removed." }, { status: 400 });
    await db.sql`DELETE FROM identity_whitelist WHERE email = ${invitedEmail}`;
    await db.sql`UPDATE identity_whitelist_history SET removed_at = NOW() WHERE email = ${invitedEmail}`;
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/whitelist" };
