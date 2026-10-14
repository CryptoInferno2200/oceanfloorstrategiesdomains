import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { PLANS, firstChargeCents, surchargeCents, tldOf } from "../lib/pricing.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 5000) return Response.json({ error: "Request is too large." }, { status: 413 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const plan = normalize(body.plan);
  const listing = normalize(body.listing || "both");
  const fqdn = normalize(body.fqdn);
  const product = PLANS[plan];
  if (!product || !["web", "web3", "both"].includes(listing) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(fqdn)) {
    return Response.json({ error: "Checkout details are invalid." }, { status: 400 });
  }
  const tld = tldOf(fqdn);
  const surcharge = surchargeCents(plan, tld);
  const amount = firstChargeCents(plan, tld);
  const user = await getUser();
  const sauce = normalize(body.sauce);
  if (sauce) {
    // Sauce launches are always OFS One, owned by the signed-in seat, and publish once paid.
    if (!user?.email) return Response.json({ error: "Sign in to publish a Sauce launch." }, { status: 401 });
    const [launch] = await getDatabase().sql`SELECT fqdn, status FROM sauce_launches WHERE slug = ${sauce} AND user_email = ${normalize(user.email)}`;
    if (!launch || launch.fqdn !== fqdn || plan !== "one") return Response.json({ error: "Sauce launch not found." }, { status: 404 });
    if (launch.status === "published") return Response.json({ error: "This launch is already published." }, { status: 409 });
    const db = getDatabase();
    const email = normalize(user.email);
    const [eligible] = await db.sql`SELECT email FROM identity_whitelist WHERE email = ${email}`;
    if (eligible) {
      // Complimentary seats publish without Stripe.
      const purchasedAt = new Date();
      const renewsAt = new Date(purchasedAt);
      renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
      await db.sql`
        INSERT INTO purchase_history
          (id, user_email, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at)
        VALUES
          (${"sauce-" + sauce}, ${email}, ${fqdn}, ${plan}, ${product.label}, ${listing}, ${0}, ${true}, ${"complimentary"}, ${purchasedAt.toISOString()}, ${renewsAt.toISOString()})
        ON CONFLICT (id) DO NOTHING
      `;
      await db.sql`
        UPDATE sauce_launches
        SET status = 'published', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
        WHERE slug = ${sauce} AND user_email = ${email}
      `;
      return Response.json({ url: `${origin}/sauce.html?launched=${encodeURIComponent(sauce)}` }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) return Response.json({ error: "Checkout is not configured." }, { status: 503 });
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/profile.html?checkout=success`,
    cancel_url: `${origin}/checkout.html?bundle=${encodeURIComponent(plan)}&listing=${encodeURIComponent(listing)}&fqdn=${encodeURIComponent(fqdn)}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": `${product.label} · ${fqdn}`,
    "metadata[plan]": plan,
    "metadata[listing]": listing,
    "metadata[fqdn]": fqdn,
  });
  if (product.monthly) {
    // Monthly plans run as a subscription; any name cost above the .com credit is a one-time line on the first invoice.
    params.set("mode", "subscription");
    params.set("line_items[0][price_data][unit_amount]", String(product.cents));
    params.set("line_items[0][price_data][recurring][interval]", "month");
    params.set("subscription_data[metadata][plan]", plan);
    params.set("subscription_data[metadata][fqdn]", fqdn);
    if (surcharge) {
      params.set("line_items[1][quantity]", "1");
      params.set("line_items[1][price_data][currency]", "usd");
      params.set("line_items[1][price_data][unit_amount]", String(surcharge));
      params.set("line_items[1][price_data][product_data][name]", `.${tld} above credit · ${fqdn}`);
    }
  }
  if (sauce) {
    params.set("metadata[sauce]", sauce);
    params.set("success_url", `${origin}/sauce.html?launched=${encodeURIComponent(sauce)}`);
    params.set("cancel_url", `${origin}/sauce.html#launch-${encodeURIComponent(sauce)}`);
  }
  if (user?.email) params.set("customer_email", user.email);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const session = await response.json().catch(() => ({})) as { url?: string; error?: { message?: string } };
  if (!response.ok || !session.url) return Response.json({ error: session.error?.message || "Checkout could not start." }, { status: 502 });
  return Response.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/create-checkout", method: "POST" };
