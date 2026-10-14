import type { getDatabase } from "@netlify/database";

// Accounts without an active Abyss One seat can keep this many projects.
export const FREE_PROJECT_LIMIT = 3;

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
  return {
    error: `You have ${FREE_PROJECT_LIMIT} projects. Join OFS Abyss One ($299 / month) to add more.`,
    code: "project_limit",
    limit: FREE_PROJECT_LIMIT,
    upgrade: "/checkout.html?bundle=abyss-one&listing=both",
  };
}
