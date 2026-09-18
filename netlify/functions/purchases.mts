import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);
const PLANS = new Set(["claim", "one", "abyss-one", "tide", "abyss", "reef"]);
const LABELS: Record<string, string> = { claim: "Claim · name only", one: "OFS One", "abyss-one": "OFS Abyss One", tide: "Tide seat", abyss: "Abyss seat", reef: "Reef seat" };
const LISTINGS = new Set(["web", "web3", "both"]);
const validDomain = (value: string) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

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
    const label = LABELS[plan];
    const fqdn = normalize(body.fqdn);
    const listing = clean(body.listing, 20) || "both";
    if (!id || !PLANS.has(plan) || !label || !validDomain(fqdn) || !LISTINGS.has(listing)) {
      return Response.json({ error: "Purchase details are invalid." }, { status: 400 });
    }
    const [eligible] = await db.sql`SELECT email FROM identity_whitelist WHERE email = ${email}`;
    if (!eligible) return Response.json({ error: "Paid purchases are recorded only after payment confirmation." }, { status: 403 });
    const safePurchasedAt = new Date();
    const renewsAt = new Date(safePurchasedAt);
    renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
    await db.sql`
      INSERT INTO purchase_history
        (id, user_email, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at)
      VALUES
        (${id}, ${email}, ${fqdn}, ${plan}, ${label}, ${listing},
         ${0}, ${true}, ${"complimentary"},
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
