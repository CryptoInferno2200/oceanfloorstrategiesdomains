import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { RETENTION_DAYS, deleteUpload, uploadStore, type UploadManifest } from "../lib/uploads.mts";

// Hourly cleanup: expires chat uploads, drops abandoned partial uploads, and prunes old rate-limit windows.
const TIME_BUDGET_MS = 20000;
const PARTIAL_UPLOAD_HOURS = 24;

export default async () => {
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const db = getDatabase();
  let removed = 0;

  const expired = await db.sql`
    SELECT id FROM chat_uploads
    WHERE created_at < NOW() - make_interval(days => ${RETENTION_DAYS})
       OR (NOT complete AND created_at < NOW() - make_interval(hours => ${PARTIAL_UPLOAD_HOURS}))
    ORDER BY created_at
    LIMIT 500
  `;
  for (const row of expired) {
    if (outOfTime()) break;
    await deleteUpload(String(row.id));
    await db.sql`DELETE FROM chat_uploads WHERE id = ${row.id}`;
    removed++;
  }

  // Uploads made before chat_uploads existed are only known by their manifests.
  if (!outOfTime()) {
    const store = uploadStore();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const { directories } = await store.list({ directories: true });
    for (const id of directories) {
      if (outOfTime()) break;
      const [tracked] = await db.sql`SELECT 1 AS found FROM chat_uploads WHERE id::text = ${id}`;
      if (tracked) continue;
      const manifest = (await store.get(`${id}/manifest`, { type: "json" })) as UploadManifest | null;
      if (manifest && Date.parse(manifest.createdAt) > cutoff) continue;
      await deleteUpload(id);
      removed++;
    }
  }

  await db.sql`DELETE FROM ai_rate_limits WHERE window_start < NOW() - INTERVAL '2 days'`;
  console.log(`Cleanup removed ${removed} uploads in ${Date.now() - started} ms`);
};

export const config: Config = { schedule: "@hourly" };
