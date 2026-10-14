import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import {
  CHUNK_BYTES,
  CHUNK_LIMIT_PER_HOUR,
  MAX_FILE_BYTES,
  loadManifest,
  requesterKey,
  uploadStore,
  type UploadManifest,
} from "../lib/uploads.mts";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function countChunk(identity: string, member: boolean) {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  const [usage] = await getDatabase().sql`
    INSERT INTO ai_rate_limits (identity_key, window_start, request_count)
    VALUES (${"upload:" + identity}, ${bucket.toISOString()}, 1)
    ON CONFLICT (identity_key, window_start)
    DO UPDATE SET request_count = ai_rate_limits.request_count + 1
    RETURNING request_count
  `;
  return Number(usage?.request_count || 0) <= CHUNK_LIMIT_PER_HOUR[member ? "member" : "guest"];
}

export default async (req: Request, context: Context) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "Request origin is not allowed." }, 403);

  const { identity, member } = await requesterKey(context);
  const store = uploadStore();
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
    const cap = MAX_FILE_BYTES[member ? "member" : "guest"];
    if (!Number.isFinite(size) || size <= 0) return json({ error: "That file is empty." }, 400);
    if (size > cap) {
      const mb = Math.round(cap / 1024 / 1024);
      return json({ error: `Files can be up to ${mb} MB${member ? "" : " (sign in for larger uploads)"}.` }, 413);
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
    await store.setJSON(`${manifest.id}/manifest`, manifest);
    return json({ id: manifest.id, chunkBytes: CHUNK_BYTES, parts: manifest.parts });
  }

  const manifest = await loadManifest(id, identity);
  if (!manifest) return json({ error: "Upload not found." }, 404);

  // Send one chunk: PUT /api/ofs-uploads?id=...&part=N with the raw bytes as the body.
  if (req.method === "PUT") {
    const part = Number(url.searchParams.get("part"));
    if (!Number.isInteger(part) || part < 0 || part >= manifest.parts) return json({ error: "Invalid chunk." }, 400);
    if (manifest.complete) return json({ error: "Upload is already complete." }, 409);
    if (!(await countChunk(identity, member))) return json({ error: "Upload limit reached. Try again later." }, 429);
    const data = await req.arrayBuffer();
    const expected = part === manifest.parts - 1 ? manifest.size - part * CHUNK_BYTES : CHUNK_BYTES;
    if (data.byteLength !== expected) return json({ error: "Chunk size does not match." }, 400);
    await store.set(`${id}/part-${part}`, data);
    if (part === manifest.parts - 1) {
      const { blobs } = await store.list({ prefix: `${id}/part-` });
      if (blobs.length !== manifest.parts) return json({ error: "Some chunks are missing. Retry the upload." }, 409);
      await store.setJSON(`${id}/manifest`, { ...manifest, complete: true });
      return json({ id, complete: true });
    }
    return json({ id, part });
  }

  if (req.method === "DELETE") {
    const { blobs } = await store.list({ prefix: `${id}/` });
    await Promise.all(blobs.map((blob) => store.delete(blob.key)));
    return json({ id, deleted: true });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config: Config = {
  path: "/api/ofs-uploads",
  method: ["POST", "PUT", "DELETE"],
};
