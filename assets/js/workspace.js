const $ = (id) => document.getElementById(id);
const FILES = ["index.html", "styles.css", "app.js"];
const COLLECTION = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const state = { fqdn: "", frameFqdn: "", files: {}, active: "index.html", dirty: new Set(), saved: false, collection: "" };
const signInUrl = () => "home.html?signin=1&next=" + encodeURIComponent(location.pathname.slice(1) + location.search);

// Bridge calls pass quiet: true so an expired session doesn't navigate away from unsaved work.
async function api(url, opts = {}, quiet = false) {
  const response = await fetch(url, { headers: { "content-type": "application/json", Accept: "application/json" }, ...opts });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    if (!quiet) location.href = signInUrl();
    throw Object.assign(new Error("Sign in to open your workspace."), { signin: true });
  }
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

const baseFor = (fqdn) => "/api/workspace/" + encodeURIComponent(fqdn);
const base = () => baseFor(state.fqdn);

function status(id, text, bad = false) {
  const node = $(id);
  node.textContent = text;
  node.classList.toggle("bad", bad);
}

function when(value) {
  const date = new Date(value);
  return isNaN(date) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Sandbox files
function showFile(path) {
  state.files[state.active] = $("editor").value;
  state.active = path;
  $("editor").value = state.files[path] || "";
  document.querySelectorAll("[data-file]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.file === path)));
}

function runPreview() {
  // Until the new page loads, calls from the old one are dropped.
  state.frameFqdn = "";
  $("preview").dataset.fqdn = state.fqdn;
  $("preview").src = "/sandbox/" + encodeURIComponent(state.fqdn) + "?t=" + Date.now();
}

async function save() {
  state.files[state.active] = $("editor").value;
  const files = {};
  for (const path of state.saved ? state.dirty : FILES) files[path] = state.files[path];
  if (!Object.keys(files).length) return runPreview();
  $("save").disabled = true;
  status("file-status", "Saving…");
  try {
    await api(base() + "/files", { method: "PUT", body: JSON.stringify({ files }) });
    state.dirty.clear();
    state.saved = true;
    status("file-status", "Saved " + Object.keys(files).join(", ") + ".");
    runPreview();
  } catch (error) {
    status("file-status", error.message, true);
  } finally {
    $("save").disabled = false;
  }
}

// Database
async function loadCollections() {
  const { collections } = await api(base());
  const wrap = $("collections");
  wrap.replaceChildren();
  if (!collections.length) {
    wrap.append(Object.assign(document.createElement("span"), { className: "status", textContent: "No collections yet. Add a record below or from the sandbox with ofsdb.add()." }));
  }
  for (const c of collections) {
    const button = Object.assign(document.createElement("button"), { className: "ghost", textContent: c.collection + " · " + c.count });
    button.addEventListener("click", () => openCollection(c.collection));
    wrap.append(button);
  }
}

async function openCollection(name) {
  if (!COLLECTION.test(name)) return status("db-status", "Collection names use a-z, 0-9, - and _.", true);
  state.collection = name;
  $("collection").value = name;
  $("add").disabled = $("clear").disabled = false;
  $("db-h").textContent = "Collection · " + name;
  const { records } = await api(base() + "/records?collection=" + encodeURIComponent(name) + "&limit=200");
  const ul = $("records");
  ul.replaceChildren();
  status("db-status", records.length ? records.length + " record" + (records.length === 1 ? "" : "s") + " (newest first)." : "");
  if (!records.length) ul.append(Object.assign(document.createElement("li"), { className: "empty", textContent: "No records in " + name + " yet." }));
  for (const record of records) {
    const li = document.createElement("li");
    const meta = Object.assign(document.createElement("div"), { className: "meta" });
    meta.append("#" + record.id + " · " + when(record.updated_at));
    const remove = Object.assign(document.createElement("button"), { className: "ghost", textContent: "Delete" });
    remove.addEventListener("click", async () => {
      if (!confirm("Delete record #" + record.id + "?")) return;
      await api(base() + "/records?id=" + record.id, { method: "DELETE" }).catch((e) => status("db-status", e.message, true));
      refreshDb();
    });
    meta.append(remove);
    li.append(meta, Object.assign(document.createElement("pre"), { textContent: JSON.stringify(record.data, null, 2) }));
    ul.append(li);
  }
}

function refreshDb() {
  return Promise.all([loadCollections(), state.collection ? openCollection(state.collection) : null])
    .catch((error) => status("db-status", error.message, true));
}

async function addRecord() {
  let data;
  try { data = JSON.parse($("record").value); } catch (_) { return status("db-status", "That isn’t valid JSON.", true); }
  try {
    await api(base() + "/records", { method: "POST", body: JSON.stringify({ collection: state.collection, data }) });
    refreshDb();
  } catch (error) {
    status("db-status", error.message, true);
  }
}

// Bridge: the sandbox has an opaque origin, so it asks this page to make database calls for it.
// Calls run against the project the frame was loaded for, never a project selected since.
const BRIDGE = {
  list: (f, a) => api(baseFor(f) + "/records?collection=" + encodeURIComponent(a.collection) + "&limit=" + (Number(a.limit) || 100), {}, true).then((r) => r.records),
  add: (f, a) => api(baseFor(f) + "/records", { method: "POST", body: JSON.stringify({ collection: a.collection, data: a.data }) }, true).then((r) => r.record),
  update: (f, a) => api(baseFor(f) + "/records", { method: "PATCH", body: JSON.stringify({ id: a.id, data: a.data }) }, true).then((r) => r.record),
  remove: (f, a) => api(baseFor(f) + "/records?id=" + encodeURIComponent(a.id), { method: "DELETE" }, true).then(() => true),
};

function signInNotice() {
  const node = $("project-status");
  node.replaceChildren("Your session ended. ", Object.assign(document.createElement("a"), { href: signInUrl(), textContent: "Sign in again" }), " — unsaved edits stay in this tab until you leave.");
  node.classList.add("bad");
}

$("preview").addEventListener("load", () => { state.frameFqdn = $("preview").dataset.fqdn || ""; });

let refreshTimer = 0;
addEventListener("message", async (event) => {
  const frame = $("preview").contentWindow;
  if (event.source !== frame || !event.data || event.data.type !== "ofsdb:call") return;
  const { id, op, args, fqdn } = event.data;
  // Drop calls from a sandbox loaded for another project, or one still loading.
  if (!fqdn || fqdn !== state.fqdn || fqdn !== state.frameFqdn) return;
  const reply = (body) => frame.postMessage({ type: "ofsdb:result", id, ...body }, "*");
  if (!Object.hasOwn(BRIDGE, op)) return reply({ error: "Unknown ofsdb call." });
  try {
    reply({ result: await BRIDGE[op](fqdn, args || {}) });
    if (op !== "list" && fqdn === state.fqdn) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshDb, 300); }
  } catch (error) {
    reply({ error: error.message });
    if (error.signin) signInNotice();
  }
});

// Project selection
async function openProject(fqdn) {
  state.fqdn = fqdn;
  state.collection = "";
  state.dirty.clear();
  history.replaceState(null, "", "workspace.html?fqdn=" + encodeURIComponent(fqdn));
  status("project-status", "Opening " + fqdn + "…");
  $("records").replaceChildren();
  $("db-h").textContent = "Collections";
  $("add").disabled = $("clear").disabled = true;
  try {
    const result = await api(base());
    state.files = { ...result.files };
    state.active = "index.html";
    $("editor").value = state.files["index.html"];
    document.querySelectorAll("[data-file]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.file === "index.html")));
    state.saved = result.saved;
    $("workspace").hidden = false;
    $("golive").hidden = false;
    $("golive").href = "live.html?fqdn=" + encodeURIComponent(fqdn);
    status("project-status", (result.project.name || fqdn) + " · " + (result.saved ? "sandbox saved" : "starter files, not saved yet"));
    runPreview();
    refreshDb();
  } catch (error) {
    $("workspace").hidden = true;
    status("project-status", error.message, true);
  }
}

async function boot() {
  const { projects } = await api("/api/projects");
  const select = $("project");
  select.replaceChildren();
  if (!projects.length) {
    select.append(new Option("No projects yet", ""));
    status("project-status", "Start a project from the Home build desk or Auto, then come back to build it here.");
    return;
  }
  for (const p of projects) select.append(new Option((p.name ? p.name + " · " : "") + p.fqdn, p.fqdn));
  select.disabled = false;
  const wanted = new URLSearchParams(location.search).get("fqdn");
  select.value = projects.some((p) => p.fqdn === wanted) ? wanted : projects[0].fqdn;
  select.addEventListener("change", () => {
    if (state.dirty.size && !confirm("Leave without saving your sandbox changes?")) return void (select.value = state.fqdn);
    openProject(select.value);
  });
  openProject(select.value);
}

document.querySelectorAll("[data-file]").forEach((tab) => tab.addEventListener("click", () => showFile(tab.dataset.file)));
$("editor").addEventListener("input", () => state.dirty.add(state.active));
$("editor").addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    event.target.setRangeText("  ", event.target.selectionStart, event.target.selectionEnd, "end");
    state.dirty.add(state.active);
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); save(); }
});
$("save").addEventListener("click", save);
$("reload").addEventListener("click", runPreview);
$("reset").addEventListener("click", async () => {
  if (!confirm("Replace all three sandbox files with the starter template?")) return;
  const starter = (await api(base() + "/starter").catch(() => null))?.files;
  if (!starter) return status("file-status", "Couldn’t load the starter files.", true);
  state.files = { ...starter };
  FILES.forEach((path) => state.dirty.add(path));
  $("editor").value = state.files[state.active];
  save();
});
$("open").addEventListener("click", () => openCollection($("collection").value.trim().toLowerCase()).catch((e) => status("db-status", e.message, true)));
$("collection").addEventListener("keydown", (event) => { if (event.key === "Enter") $("open").click(); });
$("add").addEventListener("click", addRecord);
$("clear").addEventListener("click", async () => {
  if (!state.collection || !confirm("Delete every record in " + state.collection + "?")) return;
  await api(base() + "/records?collection=" + encodeURIComponent(state.collection), { method: "DELETE" }).catch((e) => status("db-status", e.message, true));
  refreshDb();
});
addEventListener("beforeunload", (event) => { if (state.dirty.size) event.preventDefault(); });

boot().catch((error) => status("project-status", error.message, true));
