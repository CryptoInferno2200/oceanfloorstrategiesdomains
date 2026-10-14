import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { projectLimitBody, upsertProjectWithinLimit } from "../lib/projects.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const clean = (value: unknown, max = 160) => String(value || "").trim().slice(0, max);
const LISTINGS = new Set(["web", "web3", "both"]);
const validDomain = (value: string) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return Response.json({ error: "Sign in to view your projects." }, { status: 401 });
  const db = getDatabase();

  if (request.method === "GET") {
    const rows = await db.sql`
      SELECT id, fqdn, name, description, plan, listing, stage, created_at, updated_at
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
    // body.plan is ignored: the stored plan is derived from the account's settled purchases.
    const listing = LISTINGS.has(clean(body.listing, 20)) ? clean(body.listing, 20) : "both";
    if (!validDomain(fqdn)) return Response.json({ error: "Project name is invalid." }, { status: 400 });
    const row = await upsertProjectWithinLimit(db, email, fqdn, {
      name: clean(body.name, 120),
      description: clean(body.description, 1200),
      listing,
    });
    if (!row) return Response.json(projectLimitBody(), { status: 402 });
    return Response.json({ project: row }, { status: 201 });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const rawId = clean(body.id ?? url.searchParams.get("id"), 20);
    const fqdn = normalize(body.fqdn ?? url.searchParams.get("fqdn"));
    const id = /^[0-9]{1,18}$/.test(rawId) ? rawId : "";
    if (!id && !validDomain(fqdn)) return Response.json({ error: "Send a project id or name to delete." }, { status: 400 });
    const rows = id
      ? await db.sql`DELETE FROM projects WHERE user_email = ${email} AND id = ${id}::bigint RETURNING id, fqdn`
      : await db.sql`DELETE FROM projects WHERE user_email = ${email} AND fqdn = ${fqdn} RETURNING id, fqdn`;
    if (!rows.length) return Response.json({ error: "Project not found." }, { status: 404 });
    return Response.json({ deleted: rows[0] }, { headers: { "Cache-Control": "no-store" } });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/projects" };
