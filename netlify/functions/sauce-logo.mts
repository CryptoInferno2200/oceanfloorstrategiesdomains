import type { Config, Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
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
    const [row] = await db.sql`SELECT logo_key FROM sauce_launches WHERE slug = ${slug}`;
    if (!row?.logo_key) return new Response("Not found", { status: 404 });
    const result = await store.getWithMetadata(String(row.logo_key), { type: "arrayBuffer" });
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(result.data, {
      headers: {
        "Content-Type": String(result.metadata?.contentType || "image/png"),
        "Cache-Control": "public, max-age=300",
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
  const [launch] = await db.sql`SELECT slug, brief, logo_key FROM sauce_launches WHERE slug = ${slug} AND user_email = ${email}`;
  if (!launch) return json({ error: "Launch not found." }, 404);
  if (launch.logo_key) return json({ logo: `/api/sauce-logo/${slug}` });

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
  await store.set(key, new Blob([data]), { metadata: { contentType } });
  await db.sql`UPDATE sauce_launches SET logo_key = ${key}, updated_at = NOW() WHERE slug = ${slug} AND user_email = ${email}`;
  return json({ logo: `/api/sauce-logo/${slug}`, generated });
};

export const config: Config = { path: "/api/sauce-logo/:slug" };
