import { getUser } from "@netlify/identity";
import { getDatabase } from "@netlify/database";

// Shared helpers for per-project workspaces: a record store and a sandbox of three editable files.
export const FILES = ["index.html", "styles.css", "app.js"] as const;
export type FilePath = (typeof FILES)[number];
export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_RECORD_BYTES = 32 * 1024;
export const MAX_RECORDS = 5000;
export const COLLECTION = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export type OwnedProject = { id: number; fqdn: string; name: string; description: string; stage: string };

// Resolves the signed-in owner's project, or null when it is not theirs.
export async function ownedProject(fqdnParam: unknown) {
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return { email: "", project: null };
  let fqdn = "";
  try {
    fqdn = normalize(decodeURIComponent(String(fqdnParam || "")));
  } catch {
    // Malformed escapes can't name a project.
    return { email, project: null };
  }
  const [project] = await getDatabase().sql`
    SELECT id, fqdn, name, description, stage FROM projects WHERE user_email = ${email} AND fqdn = ${fqdn}
  `;
  return { email, project: (project || null) as OwnedProject | null };
}

export function starterFiles(project: OwnedProject): Record<FilePath, string> {
  const name = project.name || project.fqdn;
  return {
    "index.html": `<main>
  <h1>${esc(name)}</h1>
  <p>${esc(project.description || "Your sandbox. Edit these files, then press Run.")}</p>
  <form id="signup">
    <input name="email" type="email" placeholder="you@example.com" required />
    <button>Join the list</button>
  </form>
  <ul id="list"></ul>
</main>
`,
    "styles.css": `body { font: 17px/1.5 system-ui, sans-serif; margin: 0; background: #fbfaf7; color: #0f172a; }
main { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
h1 { font: 400 44px/1.1 Georgia, serif; margin: 0 0 12px; }
form { display: flex; gap: 8px; margin: 24px 0; }
input { flex: 1; padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
button { padding: 12px 18px; border: 0; border-radius: 10px; background: #0f766e; color: #fff; font: inherit; }
`,
    "app.js": `// ofsdb talks to this project's database: list, add, update, remove.
const list = document.getElementById("list");

async function paint() {
  const rows = await ofsdb.list("signups");
  list.innerHTML = "";
  for (const row of rows) list.append(Object.assign(document.createElement("li"), { textContent: row.data.email }));
}

document.getElementById("signup").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = new FormData(event.target).get("email");
  await ofsdb.add("signups", { email });
  event.target.reset();
  paint();
});

paint();
`,
  };
}

export async function loadFiles(project: OwnedProject) {
  const rows = await getDatabase().sql`
    SELECT path, content, updated_at FROM project_sandbox_files WHERE project_id = ${project.id}
  `;
  const files = starterFiles(project);
  let saved = false;
  for (const row of rows) {
    if ((FILES as readonly string[]).includes(row.path)) {
      files[row.path as FilePath] = row.content;
      saved = true;
    }
  }
  return { files, saved };
}

// The sandbox page posts requests to the workspace page, which owns the signed-in session.
function bridge(parentOrigin: string) {
  return `(() => {
  const pending = new Map();
  let seq = 0;
  addEventListener("message", (event) => {
    if (event.source !== parent || !event.data || event.data.type !== "ofsdb:result") return;
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    event.data.error ? job.reject(new Error(event.data.error)) : job.resolve(event.data.result);
  });
  const call = (op, args) => new Promise((resolve, reject) => {
    if (parent === window) return reject(new Error("ofsdb works inside the OFS workspace preview."));
    const id = ++seq;
    pending.set(id, { resolve, reject });
    parent.postMessage({ type: "ofsdb:call", id, op, args }, ${JSON.stringify(parentOrigin)});
  });
  window.ofsdb = {
    list: (collection, options = {}) => call("list", { collection, ...options }),
    add: (collection, data) => call("add", { collection, data }),
    update: (id, data) => call("update", { id, data }),
    remove: (id) => call("remove", { id }),
  };
})();`;
}

const safeInline = (value: string, tag: string) => value.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

export function assemble(project: OwnedProject, files: Record<FilePath, string>, parentOrigin: string) {
  const html = files["index.html"];
  const full = /<html[\s>]/i.test(html);
  const head = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<style>${safeInline(files["styles.css"], "style")}</style>
<script>${bridge(parentOrigin)}</script>`;
  const tail = `<script>${safeInline(files["app.js"], "script")}</script>`;
  if (full) {
    const withHead = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head}</head>`) : html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
    return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tail}</body>`) : withHead + tail;
  }
  return `<!doctype html>
<html lang="en">
<head>
<title>${esc(project.name || project.fqdn)} · Sandbox</title>
${head}
</head>
<body>
${html}
${tail}
</body>
</html>`;
}
