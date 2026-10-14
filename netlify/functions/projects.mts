import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);
const PLANS = new Set(["claim", "one", "abyss-one", "tide", "abyss", "reef"]);
const LISTINGS = new Set(["web", "web3", "both"]);
// Accounts without an active Abyss One seat can keep this many projects.
const FREE_PROJECT_LIMIT = 3;
const validDomain = (value: string) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

export default async (request: Request) => {
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return Response.json({ error: "Sign in to view your projects." }, { status: 401 });
  const db = getDatabase();

  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT fqdn, name, description, plan, listing, stage, created_at, updated_at
      FROM projects
      WHERE user_email = ${email}
      ORDER BY updated_at DESC
      LIMIT 100
    `;
    return Response.json({ projects: rows }, { headers: { "Cache-Control": "no-store" } });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const fqdn = normalize(body.fqdn);
    const plan = PLANS.has(clean(body.plan, 40)) ? clean(body.plan, 40) : "one";
    const listing = LISTINGS.has(clean(body.listing, 20)) ? clean(body.listing, 20) : "both";
    if (!validDomain(fqdn)) return Response.json({ error: "Project name is invalid." }, { status: 400 });
    const [[existing], [counted], [eligible], [abyss]] = await Promise.all([
      db.sql`SELECT 1 AS found FROM projects WHERE user_email = ${email} AND fqdn = ${fqdn}`,
      db.sql`SELECT COUNT(*)::int AS total FROM projects WHERE user_email = ${email}`,
      db.sql`SELECT email FROM identity_whitelist WHERE email = ${email}`,
      db.sql`
        SELECT 1 AS found FROM purchase_history
        WHERE user_email = ${email}
          AND plan IN ('abyss-one', 'abyss')
          AND status IN ('paid', 'complimentary')
          AND (renews_at IS NULL OR renews_at > NOW())
        LIMIT 1
      `,
    ]);
    if (!existing && !eligible && !abyss && Number(counted?.total || 0) >= FREE_PROJECT_LIMIT) {
      return Response.json({
        error: `You have ${FREE_PROJECT_LIMIT} projects. Join OFS Abyss One ($299 / month) to add more.`,
        code: "project_limit",
        limit: FREE_PROJECT_LIMIT,
        upgrade: "/checkout.html?bundle=abyss-one&listing=both",
      }, { status: 402 });
    }
    const [row] = await db.sql`
      INSERT INTO projects (user_email, fqdn, name, description, plan, listing)
      VALUES (${email}, ${fqdn}, ${clean(body.name, 120)}, ${clean(body.description, 1200)}, ${plan}, ${listing})
      ON CONFLICT (user_email, fqdn) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        plan = EXCLUDED.plan,
        listing = EXCLUDED.listing,
        updated_at = NOW()
      RETURNING fqdn, name, description, plan, listing, stage, created_at, updated_at
    `;
    return Response.json({ project: row }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config: Config = { path: "/api/projects" };
