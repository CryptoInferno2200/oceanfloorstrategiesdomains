import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const OPERATOR = "oceanfloorstrategies2200@gmail.com";
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default async (request: Request) => {
  const user = await getUser();
  if (normalize(user?.email) !== OPERATOR) {
    return Response.json({ error: "Operator access required." }, { status: 403 });
  }

  const db = getDatabase();
  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT email, created_at FROM identity_whitelist ORDER BY created_at ASC
    `;
    return Response.json({ whitelist: rows });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const email = normalize(body.email);
    if (!validEmail(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    await db.sql`
      INSERT INTO identity_whitelist (email) VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `;
    return Response.json({ email }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const email = normalize(new URL(request.url).searchParams.get("email"));
    if (!validEmail(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
    if (email === OPERATOR) return Response.json({ error: "The operator cannot be removed." }, { status: 400 });
    await db.sql`DELETE FROM identity_whitelist WHERE email = ${email}`;
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/whitelist" };
