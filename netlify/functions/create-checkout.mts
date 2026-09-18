import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";

const PLANS: Record<string, { label: string; cents: number }> = {
  claim: { label: "Claim · name only", cents: 1000 },
  one: { label: "OFS One", cents: 9900 },
  "abyss-one": { label: "OFS Abyss One", cents: 29900 },
};
const TLD_CENTS: Record<string, number> = { com: 1099, net: 1199, org: 1099, app: 1399, ai: 7999, io: 3999, studio: 1999, store: 1399, gg: 1399 };
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 5000) return Response.json({ error: "Request is too large." }, { status: 413 });
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) return Response.json({ error: "Checkout is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const plan = normalize(body.plan);
  const listing = normalize(body.listing || "both");
  const fqdn = normalize(body.fqdn);
  const product = PLANS[plan];
  if (!product || !["web", "web3", "both"].includes(listing) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(fqdn)) {
    return Response.json({ error: "Checkout details are invalid." }, { status: 400 });
  }
  const tld = fqdn.split(".").pop() || "com";
  const credit = plan === "claim" ? 1000 : 1099;
  const amount = product.cents + Math.max(0, (TLD_CENTS[tld] || 1099) - credit);
  const user = await getUser();
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
