import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);

export default async (request: Request) => {
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return Response.json({ error: "Sign in to view purchase history." }, { status: 401 });
  const db = getDatabase();

  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT id, fqdn, plan, label, listing, amount_cents, complimentary, status,
             purchased_at, renews_at
      FROM purchase_history
      WHERE user_email = ${email}
      ORDER BY purchased_at DESC
      LIMIT 200
    `;
    return Response.json({ purchases: rows });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = clean(body.id, 80);
    const plan = clean(body.plan, 40);
    const label = clean(body.label, 120);
    if (!id || !plan || !label) return Response.json({ error: "Purchase details are incomplete." }, { status: 400 });
    const purchasedAt = new Date(clean(body.purchasedAt, 40));
    const safePurchasedAt = Number.isNaN(purchasedAt.valueOf()) ? new Date() : purchasedAt;
    const renewsAt = new Date(safePurchasedAt);
    renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
    const amountCents = Math.max(0, Math.round(Number(body.amountCents) || 0));
    await db.sql`
      INSERT INTO purchase_history
        (id, user_email, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at)
      VALUES
        (${id}, ${email}, ${clean(body.fqdn, 253)}, ${plan}, ${label}, ${clean(body.listing, 20) || "both"},
         ${amountCents}, ${Boolean(body.complimentary)}, ${clean(body.status, 30) || "paid"},
         ${safePurchasedAt.toISOString()}, ${renewsAt.toISOString()})
      ON CONFLICT (id) DO NOTHING
    `;
    const [row] = await db.sql`
      SELECT id, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at
      FROM purchase_history
      WHERE id = ${id} AND user_email = ${email}
    `;
    if (!row) return Response.json({ error: "Purchase receipt ID is already in use." }, { status: 409 });
    return Response.json({ purchase: row }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config: Config = { path: "/api/purchases" };
