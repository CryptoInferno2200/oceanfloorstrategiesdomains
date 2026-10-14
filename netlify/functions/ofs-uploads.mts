import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import {
  CHUNK_BYTES,
  CHUNK_LIMIT_PER_HOUR,
  GUEST_IP_CHUNK_LIMIT_PER_HOUR,
  MAX_FILE_BYTES,
  MAX_STORED_BYTES,
  START_LIMIT_PER_HOUR,
  deleteUpload,
  loadManifest,
  requesterKey,
  uploadStore,
  type UploadManifest,
} from "../lib/uploads.mts";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Counts one use of an hourly quota and reports whether it is still within the limit.
async function withinQuota(key: string, limit: number) {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  const [usage] = await getDatabase().sql`
    INSERT INTO ai_rate_limits (identity_key, window_start, request_count)
    VALUES (${key}, ${bucket.toISOString()}, 1)
    ON CONFLICT (identity_key, window_start)
    DO UPDATE SET request_count = ai_rate_limits.request_count + 1
    RETURNING request_count
  `;
  return Number(usage?.request_count || 0) <= limit;
}

const formatMb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export default async (req: Request, context: Context) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "Request origin is not allowed." }, 403);

  const { identity, owners, ip, member } = await requesterKey(context);
  const tier = member ? "member" : "guest";
  const store = uploadStore();
  const db = getDatabase();
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";

  // Start an upload: register the file and get back an id plus chunk size.
  if (req.method === "POST" && !id) {
    let body: { name?: string; type?: string; size?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send a valid request." }, 400);
    }
    const size = Number(body.size);
    const cap = MAX_FILE_BYTES[tier];
    if (!Number.isFinite(size) || size <= 0) return json({ error: "That file is empty." }, 400);
    if (size > cap) {
      return json({ error: `Files can be up to ${formatMb(cap)}${member ? "" : " (sign in for larger uploads)"}.` }, 413);
    }
    if (!(await withinQuota("upload-start:" + identity, START_LIMIT_PER_HOUR[tier]))) {
      return json({ error: "Upload limit reached. Try again later." }, 429);
    }
    const [stored] = await db.sql`SELECT COALESCE(SUM(size), 0)::bigint AS total FROM chat_uploads WHERE owner = ${identity}`;
    if (Number(stored?.total || 0) + size > MAX_STORED_BYTES[tier]) {
      return json({ error: `You have ${formatMb(MAX_STORED_BYTES[tier])} of files stored. Remove some or try again after older uploads expire.` }, 413);
    }
    const manifest: UploadManifest = {
      id: crypto.randomUUID(),
      owner: identity,
      name: String(body.name || "file").replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "file",
      type: String(body.type || "application/octet-stream").slice(0, 120),
      size,
      parts: Math.ceil(size / CHUNK_BYTES),
      complete: false,
      createdAt: new Date().toISOString(),
    };
    await db.sql`INSERT INTO chat_uploads (id, owner, size) VALUES (${manifest.id}, ${identity}, ${size})`;
    await store.setJSON(`${manifest.id}/manifest`, manifest);
    return json({ id: manifest.id, chunkBytes: CHUNK_BYTES, parts: manifest.parts });
  }

  const manifest = await loadManifest(id, owners);
  if (!manifest) return json({ error: "Upload not found." }, 404);

  // Send one chunk: PUT /api/ofs-uploads?id=...&part=N with the raw bytes as the body.
  if (req.method === "PUT") {
    const part = Number(url.searchParams.get("part"));
    if (!Number.isInteger(part) || part < 0 || part >= manifest.parts) return json({ error: "Invalid chunk." }, 400);
    if (manifest.complete) return json({ error: "Upload is already complete." }, 409);
    const allowed = member
      ? await withinQuota("upload:" + identity, CHUNK_LIMIT_PER_HOUR.member)
      : (await withinQuota("upload:" + identity, CHUNK_LIMIT_PER_HOUR.guest)) && (await withinQuota("upload-ip:" + ip, GUEST_IP_CHUNK_LIMIT_PER_HOUR));
    if (!allowed) return json({ error: "Upload limit reached. Try again later." }, 429);
    const data = await req.arrayBuffer();
    const expected = part === manifest.parts - 1 ? manifest.size - part * CHUNK_BYTES : CHUNK_BYTES;
    if (data.byteLength !== expected) return json({ error: "Chunk size does not match." }, 400);
    await store.set(`${id}/part-${part}`, data);
    if (part === manifest.parts - 1) {
      const { blobs } = await store.list({ prefix: `${id}/part-` });
      if (blobs.length !== manifest.parts) return json({ error: "Some chunks are missing. Retry the upload." }, 409);
      await store.setJSON(`${id}/manifest`, { ...manifest, complete: true });
      await db.sql`UPDATE chat_uploads SET complete = TRUE WHERE id = ${id}`;
      return json({ id, complete: true });
    }
    return json({ id, part });
  }

  if (req.method === "DELETE") {
    await deleteUpload(id);
    await db.sql`DELETE FROM chat_uploads WHERE id = ${id}`;
    return json({ id, deleted: true });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config: Config = {
  path: "/api/ofs-uploads",
  method: ["POST", "PUT", "DELETE"],
};
