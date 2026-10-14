import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";
import { rejectCrossOrigin } from "../lib/http.mts";
import { GitHubError, pushNewRepo, repoName, validToken, type RepoFile } from "../lib/github.mts";
import { page } from "../lib/sauce-page.mts";
import { exportFiles, loadFiles, ownedProject } from "../lib/workspace.mts";

// Pushes a Workspace project or a Sauce launch to a new GitHub repository, before or after publishing.
// The customer's GitHub token arrives with the request, is used for this push only, and is never stored.
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const PUSHES_PER_HOUR = 10;
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function identityHash(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Counts one push against the account's hourly budget; true when the budget is spent.
async function pushLimited(db: ReturnType<typeof getDatabase>, email: string) {
  const bucket = new Date();
  bucket.setUTCMinutes(0, 0, 0);
  const [usage] = await db.sql`
    INSERT INTO ai_rate_limits (identity_key, window_start, request_count)
    VALUES (${await identityHash("gh:" + email)}, ${bucket.toISOString()}, 1)
    ON CONFLICT (identity_key, window_start)
    DO UPDATE SET request_count = ai_rate_limits.request_count + 1
    RETURNING request_count
  `;
  return Number(usage?.request_count || 0) > PUSHES_PER_HOUR;
}

async function workspaceExport(fqdn: unknown) {
  const { project } = await ownedProject(fqdn);
  if (!project) return null;
  const { files } = await loadFiles(project);
  return { name: project.fqdn, description: project.description || project.name || project.fqdn, files: exportFiles(project, files) };
}

async function sauceExport(db: ReturnType<typeof getDatabase>, email: string, slug: unknown) {
  const [launch] = await db.sql`
    SELECT slug, fqdn, brief, logo_key, status FROM sauce_launches WHERE slug = ${normalize(slug)} AND user_email = ${email}
  `;
  if (!launch) return null;
  const brief = (typeof launch.brief === "string" ? JSON.parse(launch.brief) : launch.brief) as Record<string, any>;
  const files: RepoFile[] = [];
  let logoFile = "";
  if (launch.logo_key && launch.logo_key !== "pending") {
    const logo = await getStore("sauce-logos").getWithMetadata(String(launch.logo_key), { type: "arrayBuffer" });
    const ext = LOGO_TYPES[String(logo?.metadata?.contentType || "image/png")];
    if (logo && ext) {
      logoFile = "logo." + ext;
      files.push({ path: logoFile, content: Buffer.from(logo.data).toString("base64"), encoding: "base64" });
    }
  }
  // Without the logo file, the page would point at a private OFS URL, so drop the logo instead.
  const html = page(logoFile ? launch : { ...launch, logo_key: null }, false, logoFile);
  const kit = brief.launchKit || {};
  const list = (items: unknown) => (Array.isArray(items) ? items.map((item) => `- ${String(item)}`).join("\n") : "");
  const readme = `# ${brief.name || launch.fqdn}

${brief.tagline || ""}

${brief.solution || ""}

Domain: ${launch.fqdn} · ${brief.kind === "application" ? "Application" : "Website"}

\`index.html\` is the complete site. Open it in a browser or deploy the folder to any static host.
${kit.checklist?.length ? `\n## Launch-day checklist\n\n${list(kit.checklist)}\n` : ""}${kit.social?.length ? `\n## Social posts\n\n${list(kit.social)}\n` : ""}${kit.keywords?.length ? `\n## SEO keywords\n\n${kit.keywords.join(", ")}\n` : ""}
Exported from [OFS Domains Sauce](https://www.ofsdomains.com/sauce.html).
`;
  files.unshift({ path: "index.html", content: html }, { path: "README.md", content: readme });
  return { name: brief.name || launch.slug, description: brief.tagline || launch.fqdn, files };
}

export default async (request: Request) => {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const email = normalize((await getUser())?.email);
  if (!email) return json({ error: "Sign in to push to GitHub." }, 401);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!validToken(body.token)) return json({ error: "Paste a GitHub personal access token." }, 400);
  const token = String(body.token).trim();
  const db = getDatabase();

  const source = body.kind === "workspace" ? await workspaceExport(body.id)
    : body.kind === "sauce" ? await sauceExport(db, email, body.id)
    : undefined;
  if (source === undefined) return json({ error: "Choose a Workspace project or a Sauce launch to push." }, 400);
  if (!source) return json({ error: "Project not found on this account." }, 404);
  if (await pushLimited(db, email)) return json({ error: `GitHub pushes are capped at ${PUSHES_PER_HOUR} an hour. Try again later.` }, 429);

  try {
    const repo = await pushNewRepo(
      token,
      { name: repoName(body.repo, source.name), description: source.description, private: body.private !== false },
      source.files,
      "Export from OFS Domains",
    );
    return json({ repo });
  } catch (error) {
    if (error instanceof GitHubError) return json({ error: error.message }, error.status === 401 ? 400 : 502);
    console.error("GitHub push failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Couldn't reach GitHub. Try again in a moment." }, 502);
  }
};

export const config: Config = { path: "/api/github-push", method: "POST" };
