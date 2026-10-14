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

type Query = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;
type Client = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, any>[] }>; release(): void };

// Runs fn inside one database transaction on a dedicated connection. Shared with Sauce.
export async function transaction<T>(db: ReturnType<typeof getDatabase>, fn: (query: Query) => Promise<T>): Promise<T> {
  const client = (await (db.pool as unknown as { connect(): Promise<Client> }).connect());
  try {
    await client.query("BEGIN");
    const result = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type OwnedProject = { id: number; fqdn: string; name: string; description: string; stage: string };

// Resolves the signed-in owner's project, or null when it is not theirs.
export async function ownedProject(fqdnParam: unknown) {
  const user = await getUser();
  const email = normalize(user?.email);
  if (!email) return { email: "", project: null };
  // Route params arrive already decoded; decoding again would turn a literal "%" sequence into something else.
  const fqdn = normalize(fqdnParam);
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
// Each call is tagged with the project the sandbox was loaded for, so the workspace drops calls from a stale frame.
function bridge(parentOrigin: string, fqdn: string) {
  return `(() => {
  const fqdn = ${JSON.stringify(fqdn)};
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
    parent.postMessage({ type: "ofsdb:call", fqdn, id, op, args }, ${JSON.stringify(parentOrigin)});
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
<script>${safeInline(bridge(parentOrigin, project.fqdn), "script")}</script>`;
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

// Stand-in for the workspace bridge so an exported site runs anywhere, storing records in the browser.
const OFSDB_SHIM = `// ofsdb outside OFS: same calls as the workspace, records kept in this browser's localStorage.
// Swap these four functions for your own backend when you deploy.
(() => {
  const KEY = "ofsdb:records";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (rows) => localStorage.setItem(KEY, JSON.stringify(rows));
  const now = () => new Date().toISOString();
  window.ofsdb = {
    async list(collection, options = {}) {
      const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
      return read().filter((r) => r.collection === collection).reverse().slice(0, limit);
    },
    async add(collection, data) {
      const rows = read();
      const record = { id: rows.reduce((max, r) => Math.max(max, r.id), 0) + 1, collection, data, created_at: now(), updated_at: now() };
      write([...rows, record]);
      return record;
    },
    async update(id, data) {
      const rows = read();
      const record = rows.find((r) => r.id === Number(id));
      if (!record) throw new Error("Record not found.");
      Object.assign(record, { data, updated_at: now() });
      write(rows);
      return record;
    },
    async remove(id) {
      write(read().filter((r) => r.id !== Number(id)));
      return true;
    },
  };
})();
`;

// The sandbox files as a standalone static site: styles.css, ofsdb.js and app.js load from index.html.
export function exportFiles(project: OwnedProject, files: Record<FilePath, string>) {
  const name = project.name || project.fqdn;
  const head = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="styles.css" />
<script src="ofsdb.js"></script>`;
  const tail = `<script src="app.js"></script>`;
  const html = files["index.html"];
  let index: string;
  if (/<html[\s>]/i.test(html)) {
    const withHead = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${head}\n</head>`) : html.replace(/<html[^>]*>/i, (m) => `${m}<head>${head}</head>`);
    index = /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tail}\n</body>`) : withHead + tail;
  } else {
    index = `<!doctype html>
<html lang="en">
<head>
<title>${esc(name)}</title>
${head}
</head>
<body>
${html}
${tail}
</body>
</html>
`;
  }
  const readme = `# ${name}

${project.description || "Built in the OFS Domains workspace."}

Domain: ${project.fqdn}

## Files

- \`index.html\`: the page
- \`styles.css\`: styles
- \`app.js\`: page logic
- \`ofsdb.js\`: a local stand-in for the OFS workspace database. Records are kept in the visitor's browser (localStorage).

Open \`index.html\` in a browser, or deploy the folder to any static host.

Exported from [OFS Domains](https://www.ofsdomains.com/) before publishing.
`;
  return [
    { path: "index.html", content: index },
    { path: "styles.css", content: files["styles.css"] },
    { path: "app.js", content: files["app.js"] },
    { path: "ofsdb.js", content: OFSDB_SHIM },
    { path: "README.md", content: readme },
  ];
}
