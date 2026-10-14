const COMPLETE = ["fqdn","businessName","logoUrl","description","displayName","tagline","stack","location","email","x","haven","listing"];
    const REQUIRED = ["fqdn","businessName","logoUrl","description"];
    function read() {
      const f = document.getElementById("form");
      const o = {};
      for (const el of f.elements) if (el.name) o[el.name] = el.value.trim();
      o.brandToken = document.getElementById("brandToken").checked;
      return o;
    }
    function tick() {
      const p = read();
      const filled = COMPLETE.filter((k) => p[k]).length;
      const pct = Math.round((filled / COMPLETE.length) * 100);
      document.getElementById("fill").style.width = pct + "%";
      document.getElementById("pct").textContent = pct + "% complete";
      const miss = REQUIRED.filter((k) => !p[k] || (k === "description" && p[k].length < 12));
      document.getElementById("miss").textContent = miss.length ? "Still need: " + miss.join(", ") : "Required fields are set.";
      document.getElementById("go").disabled = miss.length > 0;
    }
    document.getElementById("form").addEventListener("input", tick);
    const PROFILE_KEY = "ofs.domains.profile.v1";
    function restore() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (_) {}
      if (!saved || typeof saved !== "object") return;
      const f = document.getElementById("form");
      for (const el of f.elements) {
        if (el.name && typeof saved[el.name] === "string" && saved[el.name] && (el.tagName === "SELECT" || !el.value)) el.value = saved[el.name];
      }
    }
    document.getElementById("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = read();
      const fqdn = String(p.fqdn || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const go = document.getElementById("go");
      // The full form (including public email and Haven address) stays on this device; only the name goes in the URL.
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Object.assign({}, p, { fqdn, at: Date.now() }))); } catch (_) {}
      go.disabled = true;
      try {
        // Signed-in accounts also keep the name + description on the project; signed-out requests get 401 and are ignored.
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fqdn, name: p.businessName, description: p.description, listing: p.listing }),
        });
        if (response.status === 402) {
          const result = await response.json().catch(() => ({}));
          document.getElementById("miss").textContent = "Saved on this device. " + (result.error || "Project limit reached.") + " Delete a project above to free a slot.";
          go.disabled = false;
          return;
        }
      } catch (_) {}
      location.href = "live.html?fqdn=" + encodeURIComponent(fqdn);
    });
    const boot = new URLSearchParams(location.search);
    restore();
    if (boot.get("fqdn")) document.getElementById("fqdn").value = boot.get("fqdn");
    document.querySelectorAll("nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        const fqdn = read().fqdn;
        if (!fqdn) return;
        const href = a.getAttribute("href").split("?")[0];
        e.preventDefault();
        location.href = href + "?fqdn=" + encodeURIComponent(fqdn);
      });
    });
    tick();
    (function paintVault() {
      const escapeHtml = (value) => {
        const span = document.createElement("span");
        span.textContent = String(value || "");
        return span.innerHTML;
      };
      function paintWhite() {
        const white = document.getElementById("white-list");
        if (!white) return;
        const sync = document.getElementById("white-sync");
        const state = window.OFSSeat ? OFSSeat.load() : { whitelist: [], syncedAt: "" };
        const invited = window.OFSSeat ? OFSSeat.listWhitelist() : [];
        if (sync) sync.textContent = "Sync " + invited.length + " · " + (state.syncedAt ? new Date(state.syncedAt).toLocaleString() : "now");
        white.innerHTML = invited.length
          ? invited.map((row) => "<li>" + escapeHtml(row.email) + " · " + escapeHtml(row.status) + (row.operator ? " · operator" : "") + "</li>").join("")
          : "<li>No whitelist emails yet.</li>";
      }
      paintWhite();
      if (window.OFSSeat && OFSSeat.onSync) OFSSeat.onSync(paintWhite);
      function paintSources() {
        const box = document.getElementById("source-list");
        if (!box || !window.OFSSync) return;
        const rows = OFSSync.status();
        const failed = rows.filter((s) => !s.ok);
        box.innerHTML = rows.map((s) => {
          const when = s.at ? new Date(s.at).toLocaleString() : "not yet";
          const mark = s.ok ? "ok" : "error";
          const extra = s.ok ? "" : " · " + s.error;
          return "<li>" + escapeHtml(s.name) + " · " + mark + " · " + Number(s.count || 0) + " · " + escapeHtml(when) + escapeHtml(extra) + "</li>";
        }).join("");
        const err = document.getElementById("sync-err");
        if (err) err.textContent = failed.length ? failed.length + " saved source" + (failed.length === 1 ? "" : "s") + " could not be read on this device." : "";
      }
      paintSources();
      if (window.OFSSync) {
        OFSSync.onSync(paintSources);
        document.getElementById("do-sync").addEventListener("click", () => {
          OFSSync.run();
          paintWhite();
          paintSources();
          // profile-account.js reloads purchases and projects from the server on this event.
          window.dispatchEvent(new CustomEvent("ofs-profile-refresh"));
        });
      }
    })();
