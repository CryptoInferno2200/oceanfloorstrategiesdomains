import type { Config } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { avatarUrl } from "../lib/profiles.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
// Saved profile fields and their length caps. Anything else in the request body is dropped.
const FIELDS: Record<string, number> = {
  fqdn: 253,
  businessName: 120,
  logoUrl: 500,
  description: 1200,
  displayName: 80,
  tagline: 80,
  stack: 20,
  location: 120,
  email: 254,
  x: 60,
  instagram: 60,
  haven: 120,
  listing: 20,
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function parseProfile(value: unknown) {
  if (!value) return {};
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<string, string>;
}

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return json({ error: "Sign in to save your profile." }, 401);
  const db = getDatabase();

  if (request.method === "GET") {
    const [row] = await db.sql`SELECT profile, avatar_key, avatar_updated_at, updated_at FROM user_profiles WHERE user_email = ${email}`;
    return json({
      profile: parseProfile(row?.profile),
      avatarUrl: avatarUrl(row),
      updatedAt: row?.updated_at || null,
    });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return json({ error: "Send the profile as JSON." }, 400);
    const profile: Record<string, string> = {};
    for (const [key, max] of Object.entries(FIELDS)) {
      const value = String(body[key] ?? "").trim().slice(0, max);
      if (value) profile[key] = value;
    }
    const text = JSON.stringify(profile);
    const [row] = await db.sql`
      INSERT INTO user_profiles (user_email, profile)
      VALUES (${email}, ${text}::jsonb)
      ON CONFLICT (user_email) DO UPDATE SET profile = EXCLUDED.profile, updated_at = NOW()
      RETURNING profile, avatar_key, avatar_updated_at, updated_at
    `;
    return json({ profile: parseProfile(row.profile), avatarUrl: avatarUrl(row), updatedAt: row.updated_at });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
};

export const config: Config = { path: "/api/profile" };
