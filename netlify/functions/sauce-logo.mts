import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
// logo_key holds this marker while a generation is running, so parallel requests don't generate twice.
const PENDING = "pending";
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Monogram fallback so every launch ships with a mark even if image generation is unavailable.
function monogram(name: string, primary: string, accent: string) {
  const initials = escapeXml(name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "S");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="220" fill="#ffffff">${initials}</text></svg>`;
}

export default async (req: Request, context: Context) => {
  const store = getStore("sauce-logos");
  const db = getDatabase();

  if (req.method === "GET") {
    const slug = normalize(context.params.slug);
    const [row] = await db.sql`SELECT logo_key, status, user_email FROM sauce_launches WHERE slug = ${slug}`;
    if (!row?.logo_key || row.logo_key === PENDING) return new Response("Not found", { status: 404 });
    // Unpublished launches are private previews, so only their owner sees the logo.
    const published = row.status === "published";
    if (!published && normalize((await getUser())?.email) !== row.user_email) return new Response("Not found", { status: 404 });
    const result = await store.getWithMetadata(String(row.logo_key), { type: "arrayBuffer" });
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(result.data, {
      headers: {
        "Content-Type": String(result.metadata?.contentType || "image/png"),
        "Cache-Control": published ? "public, max-age=300" : "private, no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return json({ error: "Sign in to use the Sauce Button." }, 401);
  const slug = normalize(context.params.slug);
  // Claim the logo slot first. A claim left pending by a crashed run frees up after two minutes.
  const [launch] = await db.sql`
    UPDATE sauce_launches SET logo_key = ${PENDING}, updated_at = NOW()
    WHERE slug = ${slug} AND user_email = ${email}
      AND (logo_key IS NULL OR (logo_key = ${PENDING} AND updated_at < NOW() - INTERVAL '2 minutes'))
    RETURNING slug, brief
  `;
  if (!launch) {
    const [existing] = await db.sql`SELECT logo_key FROM sauce_launches WHERE slug = ${slug} AND user_email = ${email}`;
    if (!existing) return json({ error: "Launch not found." }, 404);
    if (existing.logo_key === PENDING) return json({ logo: `/api/sauce-logo/${slug}`, pending: true }, 202);
    return json({ logo: `/api/sauce-logo/${slug}` });
  }

  const brief = (typeof launch.brief === "string" ? JSON.parse(launch.brief) : launch.brief) as Record<string, any>;
  let data: Uint8Array<ArrayBuffer> | string = monogram(String(brief.name || "Sauce"), brief.colors?.primary || "#0f766e", brief.colors?.accent || "#f59e0b");
  let contentType = "image/svg+xml";
  let generated = false;
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.NETLIFY_AI_GATEWAY_KEY,
      httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, "") },
    });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: `Square app icon logo for "${brief.name}" — ${brief.logoPrompt || brief.tagline}. Flat vector style, bold simple mark, brand colors ${brief.colors?.primary} and ${brief.colors?.accent}, centered on a clean background, no text, no letters, no watermark.`,
    });
    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (part?.inlineData?.data) {
      data = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
      contentType = part.inlineData.mimeType || "image/png";
      generated = true;
    }
  } catch {
    // Keep the monogram.
  }

  const key = `${slug}/logo`;
  try {
    await store.set(key, new Blob([data]), { metadata: { contentType } });
    await db.sql`UPDATE sauce_launches SET logo_key = ${key}, updated_at = NOW() WHERE slug = ${slug} AND user_email = ${email} AND logo_key = ${PENDING}`;
  } catch (error) {
    console.error("Sauce logo save failed", error);
    try {
      await db.sql`UPDATE sauce_launches SET logo_key = NULL, updated_at = NOW() WHERE slug = ${slug} AND user_email = ${email} AND logo_key = ${PENDING}`;
    } catch {
      // The two-minute expiry frees the slot.
    }
    return json({ error: "The logo could not be saved. Try again." }, 500);
  }
  return json({ logo: `/api/sauce-logo/${slug}`, generated });
};

export const config: Config = { path: "/api/sauce-logo/:slug" };
