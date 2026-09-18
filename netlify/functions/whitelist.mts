import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default async (request: Request) => {
  const user = await getUser();
  const email = normalize(user?.email);
  const db = getDatabase();
  const [permission] = email ? await db.sql`SELECT role FROM identity_roles WHERE email = ${email} AND role = 'operator'` : [];
  if (!permission) {
    return Response.json({ error: "Operator access required." }, { status: 403 });
  }

  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT email, created_at FROM identity_whitelist ORDER BY created_at ASC
    `;
    return Response.json({ whitelist: rows });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const invitedEmail = normalize(body.email);
    if (!validEmail(invitedEmail)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    await db.sql`
      INSERT INTO identity_whitelist (email) VALUES (${invitedEmail})
      ON CONFLICT (email) DO NOTHING
    `;
    return Response.json({ email: invitedEmail }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const invitedEmail = normalize(new URL(request.url).searchParams.get("email"));
    if (!validEmail(invitedEmail)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    const [protectedRole] = await db.sql`SELECT role FROM identity_roles WHERE email = ${invitedEmail} AND role = 'operator'`;
    if (protectedRole) return Response.json({ error: "The operator cannot be removed." }, { status: 400 });
    await db.sql`DELETE FROM identity_whitelist WHERE email = ${invitedEmail}`;
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/whitelist" };
