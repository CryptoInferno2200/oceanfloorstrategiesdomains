import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { attemptRegistration, checkAvailability, queueRegistration } from "../lib/registrar.mts";
import { isComplimentary, registrarUnreachable } from "../lib/complimentary.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);
const PLANS = new Set(["claim", "one", "abyss-one", "tide", "abyss", "reef"]);
const LABELS: Record<string, string> = { claim: "Claim · name only", one: "OFS One", "abyss-one": "OFS Abyss One", tide: "Tide seat", abyss: "Abyss seat", reef: "Reef seat" };
const LISTINGS = new Set(["web", "web3", "both"]);
const validDomain = (value: string) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return Response.json({ error: "Sign in to view purchase history." }, { status: 401 });
  const db = getDatabase();

  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT p.id, p.fqdn, p.plan, p.label, p.listing, p.amount_cents, p.complimentary, p.status,
             p.purchased_at, p.renews_at, r.status AS registration_status, r.registered_at, r.dns_status
      FROM purchase_history p
      LEFT JOIN domain_registrations r ON r.purchase_id = p.id
      WHERE p.user_email = ${email}
      ORDER BY p.purchased_at DESC
      LIMIT 200
    `;
    return Response.json({ purchases: rows });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    // Receipt ids are minted here; a client-chosen id could collide with another seat's receipt.
    const id = `comp-${crypto.randomUUID()}`;
    const plan = clean(body.plan, 40);
    const label = LABELS[plan];
    const fqdn = normalize(body.fqdn);
    const listing = clean(body.listing, 20) || "both";
    if (!PLANS.has(plan) || !label || !validDomain(fqdn) || !LISTINGS.has(listing)) {
      return Response.json({ error: "Purchase details are invalid." }, { status: 400 });
    }
    if (!(await isComplimentary(email))) return Response.json({ error: "Paid purchases are recorded only after payment confirmation." }, { status: 403 });
    const [owned] = await db.sql`
      SELECT id FROM purchase_history
      WHERE fqdn = ${fqdn} AND status IN ('paid', 'complimentary', 'pending')
      LIMIT 1
    `;
    if (owned) return Response.json({ error: `${fqdn} is already claimed here.` }, { status: 409 });
    const available = await checkAvailability(fqdn);
    if (!available.ok && !registrarUnreachable(available.status)) return Response.json({ error: available.error }, { status: available.status });
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
    await queueRegistration(id, email, fqdn);
    await attemptRegistration(id).catch((error) => console.error(`Registration for ${id} deferred`, error));
    const [row] = await db.sql`
      SELECT p.id, p.fqdn, p.plan, p.label, p.listing, p.amount_cents, p.complimentary, p.status, p.purchased_at, p.renews_at,
             r.status AS registration_status, r.registered_at, r.dns_status
      FROM purchase_history p
      LEFT JOIN domain_registrations r ON r.purchase_id = p.id
      WHERE p.id = ${id} AND p.user_email = ${email}
    `;
    if (!row) return Response.json({ error: "Purchase could not be recorded." }, { status: 500 });
    return Response.json({ purchase: row }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config: Config = { path: "/api/purchases" };
