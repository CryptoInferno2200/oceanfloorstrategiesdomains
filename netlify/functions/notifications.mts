import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const OPERATOR = "oceanfloorstrategies2200@gmail.com";
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

export default async (request: Request) => {
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return Response.json({ error: "Sign in to view notifications." }, { status: 401 });
  const db = getDatabase();

  if (request.method === "GET") {
    const [updates, renewals] = await Promise.all([
      db.sql`
        SELECT id, title, message, created_at
        FROM user_notifications
        WHERE target_email IS NULL OR target_email = ${email}
        ORDER BY created_at DESC
        LIMIT 50
      `,
      db.sql`
        SELECT id, label, fqdn, renews_at, amount_cents, complimentary
        FROM purchase_history
        WHERE user_email = ${email} AND renews_at IS NOT NULL AND status IN ('paid', 'complimentary')
        ORDER BY renews_at ASC
        LIMIT 50
      `,
    ]);
    return Response.json({ updates, renewals, canBroadcast: email === OPERATOR });
  }

  if (request.method === "POST") {
    if (email !== OPERATOR) return Response.json({ error: "Operator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const title = clean(body.title, 100);
    const message = clean(body.message, 1000);
    if (!title || !message) return Response.json({ error: "Add a title and update." }, { status: 400 });
    const [row] = await db.sql`
      INSERT INTO user_notifications (title, message, target_email, created_by)
      VALUES (${title}, ${message}, NULL, ${email})
      RETURNING id, title, message, created_at
    `;
    return Response.json({ notification: row }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config: Config = { path: "/api/notifications" };
