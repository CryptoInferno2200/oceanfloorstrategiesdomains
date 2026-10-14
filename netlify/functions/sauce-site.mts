import type { Config, Context } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { PAGE_HEADERS, page } from "../lib/sauce-page.mts";

// Hosts every Sauce launch at /s/<slug>. Unpaid launches are a private preview for their owner.
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export default async (_req: Request, context: Context) => {
  const slug = normalize(context.params.slug);
  const db = getDatabase();
  const [launch] = await db.sql`SELECT slug, fqdn, brief, logo_key, status, user_email FROM sauce_launches WHERE slug = ${slug}`;
  const notFound = () => new Response("<!doctype html><title>Not found</title><p>This Sauce launch is not published.</p>", { status: 404, headers: { ...PAGE_HEADERS, "Cache-Control": "no-store" } });
  if (!launch) return notFound();
  let preview = false;
  if (launch.status !== "published") {
    const user = await getUser();
    if (normalize(user?.email) !== launch.user_email) return notFound();
    preview = true;
  }
  return new Response(page(launch, preview), {
    headers: { ...PAGE_HEADERS, "Cache-Control": preview ? "no-store" : "public, max-age=60" },
  });
};

export const config: Config = { path: "/s/:slug" };
