import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { AVATAR_STORE, avatarKey, avatarUrl } from "../lib/profiles.mts";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const MAX_BYTES = 2 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Trust the file's bytes, not the declared type. SVG is refused because it can carry script.
function sniff(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return json({ error: "Sign in to manage your photo." }, 401);
  const db = getDatabase();
  const store = getStore(AVATAR_STORE);
  const key = avatarKey(email);

  if (request.method === "GET") {
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(result.data, {
      headers: {
        "Content-Type": String(result.metadata?.contentType || "image/png"),
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (request.method === "POST") {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return json({ error: "Photos can be up to 2 MB." }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return json({ error: "Choose a photo to upload." }, 400);
    if (bytes.length > MAX_BYTES) return json({ error: "Photos can be up to 2 MB." }, 413);
    const contentType = sniff(bytes);
    if (!contentType) return json({ error: "Use a PNG, JPEG, WebP, or GIF image." }, 415);
    await store.set(key, new Blob([bytes]), { metadata: { contentType } });
    const [row] = await db.sql`
      INSERT INTO user_profiles (user_email, avatar_key, avatar_updated_at)
      VALUES (${email}, ${key}, NOW())
      ON CONFLICT (user_email) DO UPDATE SET avatar_key = EXCLUDED.avatar_key, avatar_updated_at = NOW(), updated_at = NOW()
      RETURNING avatar_key, avatar_updated_at
    `;
    return json({ avatarUrl: avatarUrl(row) }, 201);
  }

  if (request.method === "DELETE") {
    await store.delete(key);
    await db.sql`UPDATE user_profiles SET avatar_key = NULL, avatar_updated_at = NULL, updated_at = NOW() WHERE user_email = ${email}`;
    return json({ avatarUrl: null });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
};

export const config: Config = { path: "/api/profile/avatar" };
