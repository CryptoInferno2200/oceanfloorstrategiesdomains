import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";

const PLANS: Record<string, { label: string; cents: number }> = {
  claim: { label: "Claim · name only", cents: 1000 },
  one: { label: "OFS One", cents: 9900 },
  "abyss-one": { label: "OFS Abyss One", cents: 29900 },
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const TLD_CENTS: Record<string, number> = { com: 1099, net: 1199, org: 1099, app: 1399, ai: 7999, io: 3999, studio: 1999, store: 1399, gg: 1399 };
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
};

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const secret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "Payment verification is not configured." }, { status: 503 });
  const raw = await request.text();
  const parts = Object.fromEntries((request.headers.get("stripe-signature") || "").split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return new Response("Invalid signature", { status: 400 });
  const expected = await sign(secret, `${timestamp}.${raw}`);
  if (!safeEqual(expected, parts.v1)) return new Response("Invalid signature", { status: 400 });

  let event: { id?: string; type?: string; data?: { object?: Record<string, any> } };
  try { event = JSON.parse(raw); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return new Response(null, { status: 204 });
  const session = event.data?.object || {};
  if (session.payment_status !== "paid") return new Response(null, { status: 204 });
  const plan = normalize(session.metadata?.plan);
  const product = PLANS[plan];
  const email = normalize(session.customer_details?.email || session.customer_email);
  const fqdn = normalize(session.metadata?.fqdn);
  const listing = normalize(session.metadata?.listing || "both");
  const tld = fqdn.split(".").pop() || "com";
  const expectedCents = product ? product.cents + Math.max(0, (TLD_CENTS[tld] || 1099) - (plan === "claim" ? 1000 : 1099)) : 0;
  if (!product || Number(session.amount_total) !== expectedCents || !email || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(fqdn) || !["web", "web3", "both"].includes(listing)) {
    return Response.json({ error: "Verified payment metadata is incomplete." }, { status: 422 });
  }
  const db = getDatabase();
  const purchasedAt = new Date(Number(session.created || Math.floor(Date.now() / 1000)) * 1000);
  const renewsAt = new Date(purchasedAt);
  renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
  await db.sql`
    INSERT INTO purchase_history
      (id, user_email, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at)
    VALUES
      (${String(session.id || event.id)}, ${email}, ${fqdn}, ${plan}, ${product.label}, ${listing}, ${expectedCents}, ${false}, ${"paid"}, ${purchasedAt.toISOString()}, ${renewsAt.toISOString()})
    ON CONFLICT (id) DO NOTHING
  `;
  return Response.json({ received: true });
};

export const config: Config = { path: "/api/stripe-webhook", method: "POST" };
