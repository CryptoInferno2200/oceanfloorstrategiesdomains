import type { getDatabase } from "@netlify/database";
import { transaction } from "./workspace.mts";

// Accounts without an active Abyss One seat can keep this many projects.
export const FREE_PROJECT_LIMIT = 3;

// Plan stored when the account has no settled purchase for the name (matches the projects.plan column default).
export const DEFAULT_PROJECT_PLAN = "one";

export function projectLimitBody() {
  return {
    error: `You have ${FREE_PROJECT_LIMIT} projects. Join OFS Abyss One ($299 / month) to add more.`,
    code: "project_limit",
    limit: FREE_PROJECT_LIMIT,
    upgrade: "/checkout.html?bundle=abyss-one&listing=both",
  };
}

// Returns the upgrade response body when adding this project would pass the free limit, otherwise null.
export async function projectLimitBlock(db: ReturnType<typeof getDatabase>, email: string, fqdn?: string) {
  const [[existing], [counted], [eligible], [abyss]] = await Promise.all([
    fqdn ? db.sql`SELECT 1 AS found FROM projects WHERE user_email = ${email} AND fqdn = ${fqdn}` : Promise.resolve([]),
    db.sql`SELECT COUNT(*)::int AS total FROM projects WHERE user_email = ${email}`,
    db.sql`SELECT email FROM identity_whitelist WHERE email = ${email}`,
    db.sql`
      SELECT 1 AS found FROM purchase_history
      WHERE user_email = ${email}
        AND plan IN ('abyss-one', 'abyss')
        AND status IN ('paid', 'complimentary')
        AND (renews_at IS NULL OR renews_at > NOW())
      LIMIT 1
    `,
  ]);
  if (existing || eligible || abyss || Number(counted?.total || 0) < FREE_PROJECT_LIMIT) return null;
  return projectLimitBody();
}

type ProjectInput = { name: string; description: string; listing: string };

// Inserts or updates a project under the same per-account lock Sauce takes, so concurrent saves cannot pass the limit.
// The plan comes from the account's latest settled purchase for the name, never from the client.
// Returns the saved row, or null when the account is over its project limit.
export async function upsertProjectWithinLimit(db: ReturnType<typeof getDatabase>, email: string, fqdn: string, input: ProjectInput) {
  return transaction(db, async (query) => {
    await query("SELECT pg_advisory_xact_lock(hashtext($1))", ["projects:" + email]);
    const [row] = await query(`
      WITH allowed AS (
        SELECT (
          EXISTS (SELECT 1 FROM projects WHERE user_email = $1 AND fqdn = $2)
          OR EXISTS (SELECT 1 FROM identity_whitelist WHERE email = $1)
          OR EXISTS (
            SELECT 1 FROM purchase_history
            WHERE user_email = $1
              AND plan IN ('abyss-one', 'abyss')
              AND status IN ('paid', 'complimentary')
              AND (renews_at IS NULL OR renews_at > NOW())
          )
          OR (SELECT COUNT(*) FROM projects WHERE user_email = $1) < $7
        ) AS ok
      ),
      settled AS (
        SELECT plan FROM purchase_history
        WHERE user_email = $1 AND fqdn = $2 AND status IN ('paid', 'complimentary')
        ORDER BY purchased_at DESC
        LIMIT 1
      )
      INSERT INTO projects (user_email, fqdn, name, description, plan, listing)
      SELECT $1, $2, $3, $4, COALESCE((SELECT plan FROM settled), $5), $6
      FROM allowed
      WHERE allowed.ok
      ON CONFLICT (user_email, fqdn) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        plan = EXCLUDED.plan,
        listing = EXCLUDED.listing,
        updated_at = NOW()
      RETURNING id, fqdn, name, description, plan, listing, stage, created_at, updated_at
    `, [email, fqdn, input.name, input.description, DEFAULT_PROJECT_PLAN, input.listing, FREE_PROJECT_LIMIT]);
    return row || null;
  });
}
