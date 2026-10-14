import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { PLANS, firstChargeCents, tldOf } from "../lib/pricing.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
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

async function stripeGet(path: string) {
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Stripe ${path.split("?")[0]} returned ${response.status}`);
  return response.json() as Promise<Record<string, any>>;
}

// Finds the purchase a charge paid for: a one-time checkout session, or the subscription behind an invoice.
async function purchaseFor(paymentIntent: string, invoiceId: string) {
  if (paymentIntent) {
    const sessions = await stripeGet(`checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`);
    if (sessions.data?.[0]?.id) return { session: String(sessions.data[0].id), subscription: "" };
    if (!invoiceId) {
      const payments = await stripeGet(`invoice_payments?payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(paymentIntent)}&limit=1`).catch((): Record<string, any> => ({}));
      invoiceId = String(payments.data?.[0]?.invoice || "");
    }
  }
  if (!invoiceId) return null;
  const invoice = await stripeGet(`invoices/${encodeURIComponent(invoiceId)}`);
  const subscription = String(invoice.subscription || invoice.parent?.subscription_details?.subscription || "");
  return subscription ? { session: "", subscription } : null;
}

async function reverse(event: { type?: string; data?: { object?: Record<string, any> } }) {
  const object = event.data?.object || {};
  // Full refunds and lost disputes end the seat; an open dispute suspends it until Stripe decides.
  let status = "";
  let from = ["paid", "pending"];
  if (event.type === "charge.refunded") status = object.refunded ? "refunded" : "";
  else if (event.type === "charge.dispute.created") { status = "pending"; from = ["paid"]; }
  else if (object.status === "won") { status = "paid"; from = ["pending"]; }
  else if (object.status === "lost") status = "refunded";
  if (!status) return;
  const paymentIntent = String(object.payment_intent || "");
  const invoiceId = String(event.type === "charge.refunded" ? object.invoice || "" : "");
  const purchase = await purchaseFor(paymentIntent, invoiceId);
  if (!purchase) return;
  const db = getDatabase();
  if (purchase.session) {
    await db.sql`UPDATE purchase_history SET status = ${status} WHERE id = ${purchase.session} AND status IN (${from[0]}, ${from[from.length - 1]})`;
    if (status === "refunded") {
      await db.sql`UPDATE sauce_launches SET status = 'awaiting-payment', updated_at = NOW() WHERE checkout_session_id = ${purchase.session}`;
    } else if (status === "paid") {
      await db.sql`UPDATE sauce_launches SET status = 'published', updated_at = NOW() WHERE checkout_session_id = ${purchase.session}`;
    }
  } else {
    await db.sql`UPDATE purchase_history SET status = ${status} WHERE stripe_subscription_id = ${purchase.subscription} AND status IN (${from[0]}, ${from[from.length - 1]})`;
  }
}

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const secret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "Payment verification is not configured." }, { status: 503 });
  const raw = await request.text();
  // Stripe sends one v1 signature per active secret, so a rotation carries two.
  const pairs = (request.headers.get("stripe-signature") || "").split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(pairs.find(([key]) => key === "t")?.[1]);
  const signatures = pairs.filter(([key, value]) => key === "v1" && value).map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !signatures.length) return new Response("Invalid signature", { status: 400 });
  const expected = await sign(secret, `${timestamp}.${raw}`);
  if (!signatures.some((signature) => safeEqual(expected, signature))) return new Response("Invalid signature", { status: 400 });

  let event: { id?: string; type?: string; data?: { object?: Record<string, any> } };
  try { event = JSON.parse(raw); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    try {
      await reverse(event);
    } catch (error) {
      // A 500 makes Stripe retry the event later.
      console.error("Refund or dispute could not be applied", error);
      return Response.json({ error: "Could not apply refund or dispute." }, { status: 500 });
    }
    return Response.json({ received: true });
  }
  if (event.type === "invoice.paid" || event.type === "customer.subscription.deleted") {
    // Monthly renewals push renews_at forward; cancellations end the seat.
    const object = event.data?.object || {};
    const subscription = String((event.type === "invoice.paid" ? object.subscription || object.parent?.subscription_details?.subscription : object.id) || "");
    if (!subscription) return new Response(null, { status: 204 });
    const db = getDatabase();
    if (event.type === "customer.subscription.deleted") {
      await db.sql`UPDATE purchase_history SET status = 'canceled' WHERE stripe_subscription_id = ${subscription}`;
    } else {
      const periodEnd = Number(object.lines?.data?.[0]?.period?.end || 0);
      if (periodEnd) {
        await db.sql`
          UPDATE purchase_history
          SET renews_at = GREATEST(COALESCE(renews_at, NOW()), ${new Date(periodEnd * 1000).toISOString()}::timestamptz), status = 'paid'
          WHERE stripe_subscription_id = ${subscription}
        `;
      }
    }
    return Response.json({ received: true });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return new Response(null, { status: 204 });
  const session = event.data?.object || {};
  if (session.payment_status !== "paid") return new Response(null, { status: 204 });
  const plan = normalize(session.metadata?.plan);
  const product = PLANS[plan];
  const email = normalize(session.customer_details?.email || session.customer_email);
  const fqdn = normalize(session.metadata?.fqdn);
  const listing = normalize(session.metadata?.listing || "both");
  const expectedCents = firstChargeCents(plan, tldOf(fqdn));
  if (!product || Number(session.amount_total) !== expectedCents || !email || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(fqdn) || !["web", "web3", "both"].includes(listing)) {
    return Response.json({ error: "Verified payment metadata is incomplete." }, { status: 422 });
  }
  const db = getDatabase();
  const purchasedAt = new Date(Number(session.created || Math.floor(Date.now() / 1000)) * 1000);
  const renewsAt = new Date(purchasedAt);
  if (product.monthly) renewsAt.setUTCMonth(renewsAt.getUTCMonth() + 1);
  else renewsAt.setUTCFullYear(renewsAt.getUTCFullYear() + 1);
  const subscription = typeof session.subscription === "string" ? session.subscription : null;
  await db.sql`
    INSERT INTO purchase_history
      (id, user_email, fqdn, plan, label, listing, amount_cents, complimentary, status, purchased_at, renews_at, stripe_subscription_id)
    VALUES
      (${String(session.id || event.id)}, ${email}, ${fqdn}, ${plan}, ${product.label}, ${listing}, ${expectedCents}, ${false}, ${"paid"}, ${purchasedAt.toISOString()}, ${renewsAt.toISOString()}, ${subscription})
    ON CONFLICT (id) DO NOTHING
  `;
  const sauce = normalize(session.metadata?.sauce);
  if (sauce && plan === "one") {
    await db.sql`
      UPDATE sauce_launches
      SET status = 'published', published_at = COALESCE(published_at, NOW()), checkout_session_id = ${String(session.id || event.id)}, updated_at = NOW()
      WHERE slug = ${sauce} AND user_email = ${email} AND fqdn = ${fqdn}
    `;
  }
  return Response.json({ received: true });
};

export const config: Config = { path: "/api/stripe-webhook", method: "POST" };
