/** OFS Domains — unzip a drop and start a project on Host. */
(function (root) {
  const DB = "ofs.domains.zip.v1";
  const STORE = "projects";
  const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
  const MAX_FILES = 500;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function save(id, project) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(project, id);
      tx.oncomplete = () => resolve(project);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function guessStart(names) {
    const lower = names.map((n) => n.toLowerCase());
    const hits = ["index.html", "home.html", "demo/home.html", "src/index.html", "public/index.html"];
    for (const h of hits) {
      const i = lower.findIndex((n) => n === h || n.endsWith("/" + h));
      if (i >= 0) return names[i];
    }
    return names.find((n) => /\.html?$/i.test(n)) || names[0] || "";
  }

  function guessKind(names) {
    const blob = names.join(" ").toLowerCase();
    if (blob.includes("wrangler.toml") || blob.includes("_headers")) return "pages";
    if (blob.includes("package.json")) return "app";
    if (blob.includes("androidmanifest") || blob.includes(".apk")) return "app";
    if (names.some((n) => /\.html?$/i.test(n))) return "web";
    return "files";
  }

  async function unpack(file) {
    if (!root.JSZip) throw new Error("Zip engine is not loaded.");
    if (!file || file.size > MAX_ARCHIVE_BYTES) throw new Error("Archive must be 25 MB or smaller.");
    const zip = await root.JSZip.loadAsync(file);
    const files = [];
    const names = [];
    const jobs = [];
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (names.length >= MAX_FILES) throw new Error("Archive contains more than 500 files.");
      if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").includes("..")) {
        throw new Error("Archive contains an unsafe file path.");
      }
      const declaredBytes = Number(entry._data && entry._data.uncompressedSize || 0);
      if (declaredBytes > MAX_FILE_BYTES) throw new Error("An archived file is larger than 5 MB.");
      names.push(path);
      jobs.push(
        entry.async("string").then((text) => {
          const bytes = new TextEncoder().encode(text).byteLength;
          if (bytes > MAX_FILE_BYTES) throw new Error("An archived file is larger than 5 MB.");
          files.push({ path, text, bytes });
        }),
      );
    });
    await Promise.all(jobs);
    if (files.reduce((sum, item) => sum + item.bytes, 0) > MAX_TOTAL_BYTES) {
      throw new Error("Expanded archive must be 25 MB or smaller.");
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return {
      name: String(file.name || "project.zip").replace(/\.zip$/i, ""),
      start: guessStart(names),
      kind: guessKind(names),
      count: files.length,
      files,
    };
  }

  async function start(pack, fqdn) {
    const id = (fqdn || pack.name || "drop").toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
    const project = {
      id,
      name: pack.name,
      start: pack.start,
      kind: pack.kind,
      count: pack.count,
      files: pack.files,
      at: new Date().toISOString(),
    };
    await save(id, project);
    if (root.OFSHost) {
      const html = (pack.files.find((f) => f.path === pack.start) || {}).text || "";
      const title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || pack.name;
      root.OFSHost.publish({
        fqdn: id.includes(".") ? id : id + ".pages.dev",
        businessName: title,
        description: "Started from zip drop · " + pack.count + " files · " + pack.kind,
        plan: "claim",
        listing: "both",
      });
    }
    if (root.OFSPurchases) {
      root.OFSPurchases.add({
        fqdn: id,
        plan: "claim",
        listing: "both",
        due: 0,
        complimentary: true,
        status: "zip-drop",
      });
    }
    return project;
  }

  function preview(project) {
    const file = (project.files || []).find((f) => f.path === project.start) || (project.files || [])[0];
    if (!file || !file.text) return "";
    const blob = new Blob([file.text], { type: "text/html" });
    return URL.createObjectURL(blob);
  }

  root.OFSZip = { unpack, start, loadAll, preview, guessStart, guessKind };
})(window);
