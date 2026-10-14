import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { COLLECTION, FILES, MAX_FILE_BYTES, MAX_RECORDS, MAX_RECORD_BYTES, loadFiles, ownedProject, starterFiles, transaction } from "../lib/workspace.mts";

// Per-project workspace: sandbox files plus a private record store, owner only.
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const WRITES_PER_HOUR = 600;

async function identityHash(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Counts one record write against the account's hourly budget; true when the budget is spent.
async function writeLimited(db: ReturnType<typeof getDatabase>, email: string) {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  const [usage] = await db.sql`
    INSERT INTO ai_rate_limits (identity_key, window_start, request_count)
    VALUES (${await identityHash("ws:" + email)}, ${bucket.toISOString()}, 1)
    ON CONFLICT (identity_key, window_start)
    DO UPDATE SET request_count = ai_rate_limits.request_count + 1
    RETURNING request_count
  `;
  return Number(usage?.request_count || 0) > WRITES_PER_HOUR;
}

function recordData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Record data must be a JSON object." };
  const text = JSON.stringify(value);
  if (bytes(text) > MAX_RECORD_BYTES) return { error: `Records are capped at ${MAX_RECORD_BYTES / 1024} KB.` };
  return { text };
}

export default async (request: Request, context: Context) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const { email, project } = await ownedProject(context.params.fqdn);
  if (!email) return json({ error: "Sign in to open your workspace." }, 401);
  if (!project) return json({ error: "Project not found on this account." }, 404);
  const db = getDatabase();
  const part = context.params.part || "";
  const url = new URL(request.url);

  if (!part && request.method === "GET") {
    const [{ files, saved }, collections] = await Promise.all([
      loadFiles(project),
      db.sql`
        SELECT collection, COUNT(*)::int AS count, MAX(updated_at) AS updated_at
        FROM project_records WHERE project_id = ${project.id}
        GROUP BY collection ORDER BY collection
      `,
    ]);
    const { id: _id, ...publicProject } = project;
    return json({ project: publicProject, files, saved, collections, limits: { fileBytes: MAX_FILE_BYTES, recordBytes: MAX_RECORD_BYTES, records: MAX_RECORDS } });
  }

  if (part === "starter" && request.method === "GET") return json({ files: starterFiles(project) });

  if (part === "files" && request.method === "PUT") {
    const body = (await request.json().catch(() => ({}))) as { files?: Record<string, unknown> };
    const entries = Object.entries(body.files || {}).filter(([path]) => (FILES as readonly string[]).includes(path));
    if (!entries.length) return json({ error: "Send index.html, styles.css, or app.js." }, 400);
    for (const [path, content] of entries) {
      if (typeof content !== "string") return json({ error: `${path} must be text.` }, 400);
      if (bytes(content) > MAX_FILE_BYTES) return json({ error: `${path} is over ${MAX_FILE_BYTES / 1024} KB.` }, 413);
    }
    for (const [path, content] of entries) {
      await db.sql`
        INSERT INTO project_sandbox_files (project_id, path, content)
        VALUES (${project.id}, ${path}, ${content as string})
        ON CONFLICT (project_id, path) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      `;
    }
    await db.sql`UPDATE projects SET updated_at = NOW() WHERE id = ${project.id}`;
    return json({ saved: entries.map(([path]) => path) });
  }

  if (part === "records") {
    if (request.method === "GET") {
      const collection = String(url.searchParams.get("collection") || "");
      if (!COLLECTION.test(collection)) return json({ error: "Collection names use a-z, 0-9, - and _." }, 400);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
      const rows = await db.sql`
        SELECT id, collection, data, created_at, updated_at FROM project_records
        WHERE project_id = ${project.id} AND collection = ${collection}
        ORDER BY created_at DESC, id DESC LIMIT ${limit}
      `;
      return json({ records: rows });
    }

    if (!["POST", "PATCH", "DELETE"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    if (await writeLimited(db, email)) return json({ error: `Record writes are capped at ${WRITES_PER_HOUR} an hour. Try again later.` }, 429);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (request.method === "POST") {
      const collection = String(body.collection || "");
      if (!COLLECTION.test(collection)) return json({ error: "Collection names use a-z, 0-9, - and _." }, 400);
      const data = recordData(body.data);
      if (data.error) return json({ error: data.error }, 400);
      // The per-project lock makes the count and the insert one step, so parallel adds can't pass the cap.
      const row = await transaction(db, async (query) => {
        await query("SELECT pg_advisory_xact_lock(hashtext($1))", ["records:" + project.id]);
        const [counted] = await query("SELECT COUNT(*)::int AS total FROM project_records WHERE project_id = $1", [project.id]);
        if (Number(counted?.total || 0) >= MAX_RECORDS) return null;
        const [inserted] = await query(
          `INSERT INTO project_records (project_id, collection, data)
           VALUES ($1, $2, $3::jsonb)
           RETURNING id, collection, data, created_at, updated_at`,
          [project.id, collection, data.text],
        );
        return inserted;
      });
      if (!row) return json({ error: `This project holds up to ${MAX_RECORDS} records.` }, 409);
      return json({ record: row }, 201);
    }

    const id = Number(body.id ?? url.searchParams.get("id"));

    if (request.method === "PATCH") {
      if (!Number.isSafeInteger(id)) return json({ error: "Record id is required." }, 400);
      const data = recordData(body.data);
      if (data.error) return json({ error: data.error }, 400);
      const [row] = await db.sql`
        UPDATE project_records SET data = ${data.text}::jsonb, updated_at = NOW()
        WHERE id = ${id} AND project_id = ${project.id}
        RETURNING id, collection, data, created_at, updated_at
      `;
      return row ? json({ record: row }) : json({ error: "Record not found." }, 404);
    }

    if (request.method === "DELETE") {
      const collection = String(body.collection ?? url.searchParams.get("collection") ?? "");
      if (Number.isSafeInteger(id) && id > 0) {
        const rows = await db.sql`DELETE FROM project_records WHERE id = ${id} AND project_id = ${project.id} RETURNING id`;
        return rows.length ? json({ deleted: 1 }) : json({ error: "Record not found." }, 404);
      }
      if (COLLECTION.test(collection)) {
        const rows = await db.sql`DELETE FROM project_records WHERE project_id = ${project.id} AND collection = ${collection} RETURNING id`;
        return json({ deleted: rows.length });
      }
      return json({ error: "Send a record id or a collection to clear." }, 400);
    }
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = { path: ["/api/workspace/:fqdn", "/api/workspace/:fqdn/:part"] };
