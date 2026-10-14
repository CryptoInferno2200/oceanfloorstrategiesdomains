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

  const TEXT = /\.(html?|css|js|json|svg|txt|md|xml)$/i;
  const MIME = {
    html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", json: "application/json",
    svg: "image/svg+xml", txt: "text/plain", md: "text/plain", xml: "application/xml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
    otf: "font/otf", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wasm: "application/wasm",
  };

  function isText(path) {
    return TEXT.test(path);
  }

  function mimeOf(path) {
    return MIME[(path.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
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
      const text = isText(path);
      jobs.push(
        entry.async(text ? "string" : "uint8array").then((body) => {
          const bytes = text ? new TextEncoder().encode(body).byteLength : body.byteLength;
          if (bytes > MAX_FILE_BYTES) throw new Error("An archived file is larger than 5 MB.");
          files.push(text ? { path, text: body, bytes } : { path, data: body, bytes });
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
    return project;
  }

  // Asset blob: URLs from the last preview, revoked on the next one.
  let assetUrls = [];

  // Resolve a relative reference against the start file's folder; "" for external refs.
  function resolve(base, ref) {
    const r = String(ref || "").trim();
    if (!r || r.startsWith("#") || r.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(r)) return "";
    const clean = r.split(/[?#]/)[0];
    const parts = (r.startsWith("/") ? [] : base.split("/").slice(0, -1)).concat(clean.split("/"));
    const out = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    try { return decodeURIComponent(out.join("/")); } catch (_) { return out.join("/"); }
  }

  function preview(project) {
    assetUrls.forEach((u) => URL.revokeObjectURL(u));
    assetUrls = [];
    const files = project.files || [];
    const file = files.find((f) => f.path === project.start) || files[0];
    if (!file || !file.text) return "";
    const byPath = new Map(files.map((f) => [f.path, f]));
    const urls = new Map();
    const urlOf = (path) => {
      if (urls.has(path)) return urls.get(path);
      const f = byPath.get(path);
      if (!f) return "";
      const u = URL.createObjectURL(new Blob([f.text != null ? f.text : f.data], { type: mimeOf(path) }));
      urls.set(path, u);
      assetUrls.push(u);
      return u;
    };
    // url(...) inside CSS points at images and fonts relative to the stylesheet.
    const cssUrls = (css, base) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
      const u = urlOf(resolve(base, ref));
      return u ? "url(" + q + u + q + ")" : m;
    });
    const doc = new DOMParser().parseFromString(file.text, "text/html");
    doc.querySelectorAll("link[href]").forEach((el) => {
      const path = resolve(file.path, el.getAttribute("href"));
      const f = byPath.get(path);
      if (!f) return;
      // Stylesheets are inlined (style-src allows inline, not blob:); other links get blob: URLs.
      if (/\bstylesheet\b/i.test(el.getAttribute("rel") || "") && f.text != null) {
        const style = doc.createElement("style");
        style.textContent = cssUrls(f.text, path);
        el.replaceWith(style);
      } else {
        el.setAttribute("href", urlOf(path));
      }
    });
    doc.querySelectorAll("script[src], img[src], source[src], video[src], audio[src]").forEach((el) => {
      const u = urlOf(resolve(file.path, el.getAttribute("src")));
      if (u) el.setAttribute("src", u);
    });
    doc.querySelectorAll("style").forEach((el) => { el.textContent = cssUrls(el.textContent, file.path); });
    const html = "<!doctype html>\n" + doc.documentElement.outerHTML;
    return URL.createObjectURL(new Blob([html], { type: "text/html" }));
  }

  root.OFSZip = { unpack, start, loadAll, preview, guessStart, guessKind };
})(window);
