/** OFS Domains — sync sources with per-source error handling. */
(function (root) {
  const KEY = "ofs.domains.sync.v1";
  const ERR = "ofs.domains.sync.err.v1";

  const SOURCES = [
    { id: "seat", name: "Whitelist", blurb: "Invited inboxes and operator seat." },
    { id: "vault", name: "Vault", blurb: "Purchase history for this seat." },
    { id: "host", name: "Host", blurb: "Names published on this project." },
    { id: "profile", name: "Profile", blurb: "Launch kit fields." },
    { id: "receipt", name: "Receipt", blurb: "Last live receipt." },
  ];

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || fallback);
    } catch (err) {
      return JSON.parse(fallback);
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function meta() {
    const raw = read(KEY, "{}");
    return raw && typeof raw === "object" ? raw : {};
  }

  function errors() {
    const raw = read(ERR, "{}");
    return raw && typeof raw === "object" ? raw : {};
  }

  function setError(id, message) {
    const rows = errors();
    if (message) rows[id] = { message: String(message), at: new Date().toISOString() };
    else delete rows[id];
    write(ERR, rows);
  }

  function stamp(id) {
    const now = new Date().toISOString();
    const rows = meta();
    rows[id] = now;
    rows.all = now;
    write(KEY, rows);
    return now;
  }

  function pull(id) {
    if (id === "seat") {
      if (!root.OFSSeat) throw new Error("Seat store is not loaded.");
      return root.OFSSeat.listWhitelist ? root.OFSSeat.listWhitelist() : root.OFSSeat.load().whitelist || [];
    }
    if (id === "vault") {
      if (!root.OFSPurchases) throw new Error("Vault store is not loaded.");
      return root.OFSPurchases.forAccount();
    }
    if (id === "host") {
      if (!root.OFSHost) throw new Error("Host store is not loaded.");
      return root.OFSHost.load();
    }
    if (id === "profile") {
      const raw = localStorage.getItem("ofs.domains.profile.v1");
      return raw ? JSON.parse(raw) : null;
    }
    if (id === "receipt") {
      const raw = localStorage.getItem("ofs.domains.receipt.v1");
      return raw ? JSON.parse(raw) : null;
    }
    throw new Error("Unknown source.");
  }

  function runOne(id) {
    try {
      const data = pull(id);
      setError(id, null);
      return { id, ok: true, at: stamp(id), data, error: "" };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      setError(id, message);
      if (root.OFSMail && typeof root.OFSMail.send === "function") {
        try { root.OFSMail.send({ route: "error", subject: "Sync " + id, body: message, open: false }); } catch (_) {}
      }
      return { id, ok: false, at: new Date().toISOString(), data: null, error: message };
    }
  }

  function run(ids) {
    const list = ids && ids.length ? ids : SOURCES.map((s) => s.id);
    const out = {};
    list.forEach((id) => { out[id] = runOne(id); });
    try {
      window.dispatchEvent(new CustomEvent("ofs-sync", { detail: out }));
    } catch (_) {}
    return out;
  }

  function retryFailed() {
    const bad = Object.keys(errors());
    return bad.length ? run(bad) : run();
  }

  function status() {
    const rows = meta();
    const errs = errors();
    return SOURCES.map((s) => {
      let count = 0;
      let liveError = errs[s.id] ? errs[s.id].message : "";
      try {
        const data = pull(s.id);
        count = Array.isArray(data) ? data.length : data ? 1 : 0;
      } catch (err) {
        liveError = err && err.message ? err.message : liveError || "Unavailable";
      }
      return {
        ...s,
        at: rows[s.id] || rows.all || "",
        count,
        ok: !liveError,
        error: liveError,
      };
    });
  }

  function onSync(fn) {
    const wrap = () => {
      try { fn(status()); } catch (_) {}
    };
    window.addEventListener("ofs-sync", wrap);
    window.addEventListener("ofs-whitelist-sync", wrap);
    window.addEventListener("storage", wrap);
  }

  root.OFSSync = { SOURCES, pull, run, runOne, retryFailed, status, onSync, errors };
})(window);
