import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";

// The signed-in owner's names and the business site each one serves through the OFS web edge.
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Names this account paid for (or was given), newest purchase per name, with registration, DNS, and site state.
const ownedNames = (email: string, fqdn: string | null = null) => getDatabase().sql`
  SELECT DISTINCT ON (p.fqdn) p.fqdn, r.status AS registration_status, r.dns_status,
         (s.slug IS NOT NULL) AS sauce_live,
         h.business_name, h.tagline, h.description, h.contact_email, h.phone, h.location, h.published, h.updated_at
  FROM purchase_history p
  LEFT JOIN domain_registrations r ON r.purchase_id = p.id
  LEFT JOIN hosted_sites h ON h.fqdn = p.fqdn AND h.user_email = p.user_email
  LEFT JOIN sauce_launches s ON s.fqdn = p.fqdn AND s.status = 'published'
  WHERE p.user_email = ${email} AND p.status IN ('paid', 'complimentary') AND p.fqdn <> ''
    AND (${fqdn}::text IS NULL OR p.fqdn = ${fqdn})
  ORDER BY p.fqdn, p.purchased_at DESC
  LIMIT 200
`;

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return json({ error: "Sign in to host a site on your names." }, 401);

  if (request.method === "GET") return json({ names: await ownedNames(email) });

  if (request.method === "PUT") {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return json({ error: "Send the site as JSON." }, 400);
    const fqdn = normalize(body.fqdn);
    const [owned] = await ownedNames(email, fqdn);
    if (!owned) return json({ error: "You can host a site only on a name you own here. Claim the name first." }, 403);
    const site = {
      businessName: clean(body.businessName, 120),
      tagline: clean(body.tagline, 160),
      description: clean(body.description, 2000),
      contactEmail: normalize(body.contactEmail).slice(0, 254),
      phone: clean(body.phone, 40),
      location: clean(body.location, 120),
      published: body.published !== false,
    };
    if (!site.businessName) return json({ error: "Add your business name." }, 400);
    if (!validEmail(site.contactEmail)) return json({ error: "That contact email does not look right." }, 400);
    await getDatabase().sql`
      INSERT INTO hosted_sites (fqdn, user_email, business_name, tagline, description, contact_email, phone, location, published)
      VALUES (${fqdn}, ${email}, ${site.businessName}, ${site.tagline}, ${site.description}, ${site.contactEmail}, ${site.phone}, ${site.location}, ${site.published})
      ON CONFLICT (fqdn) DO UPDATE SET
        user_email = EXCLUDED.user_email, business_name = EXCLUDED.business_name, tagline = EXCLUDED.tagline,
        description = EXCLUDED.description, contact_email = EXCLUDED.contact_email, phone = EXCLUDED.phone,
        location = EXCLUDED.location, published = EXCLUDED.published, updated_at = NOW()
    `;
    const [row] = await ownedNames(email, fqdn);
    return json({ name: row });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
};

export const config: Config = { path: "/api/hosting" };
