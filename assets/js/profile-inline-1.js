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
    document.getElementById("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const p = read();
      const q = new URLSearchParams(p).toString();
      location.href = "live.html?" + q;
    });
    const boot = new URLSearchParams(location.search);
    if (boot.get("fqdn")) document.getElementById("fqdn").value = boot.get("fqdn");
    document.querySelectorAll("nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href").split("?")[0];
        e.preventDefault();
        location.href = href + "?fqdn=" + encodeURIComponent(read().fqdn || "kelpchart.com");
      });
    });
    tick();
    (async function paintHistory() {
      const ul = document.getElementById("history");
      const who = document.getElementById("vault-who");
      const seat = window.OFSSeat ? OFSSeat.load().session : "";
      if (who) who.textContent = seat ? ("Purchase history for " + seat) : "Sign in to load purchase history across your devices.";
      ul.innerHTML = "<li>Loading purchase history…</li>";
      let rows = [];
      let remote = false;
      try {
        rows = window.OFSPurchases ? await OFSPurchases.remote() : [];
        remote = true;
      } catch (_) {
        rows = window.OFSPurchases ? OFSPurchases.forAccount() : [];
      }
      const escapeHtml = (value) => {
        const span = document.createElement("span");
        span.textContent = String(value || "");
        return span.innerHTML;
      };
      ul.innerHTML = rows.length
        ? rows.map((r) => {
            const when = new Date(r.purchased_at || r.at).toLocaleString();
            const due = remote ? Number(r.amount_cents) / 100 : Number(r.due || 0);
            const pay = r.complimentary || due === 0 ? "Complimentary" : "$" + due.toFixed(2);
            const renewal = r.renews_at ? " · renews " + new Date(r.renews_at).toLocaleDateString() : "";
            return "<li><strong>" + escapeHtml(r.label) + "</strong><span class='history-price'>" + pay + "</span><span class='history-meta'>" + escapeHtml(r.fqdn || "Account service") + " · " + escapeHtml(r.status) + " · " + when + renewal + "</span></li>";
          }).join("")
        : "<li>No purchases yet. Claim, OFS One, Abyss One, and complimentary services appear here.</li>";
      if (!remote && rows.length && who) who.textContent += " Showing this device’s saved receipts until sync is available.";
      function paintWhite() {
        const white = document.getElementById("white-list");
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
        if (err) err.textContent = failed.length ? failed.length + " source" + (failed.length === 1 ? "" : "s") + " failed. Retry keeps the good ones." : "";
      }
      paintSources();
      if (window.OFSSync) {
        OFSSync.onSync(paintSources);
        document.getElementById("do-sync").addEventListener("click", () => {
          OFSSync.run();
          paintWhite();
          paintSources();
        });
        document.getElementById("do-sync-retry").addEventListener("click", () => {
          OFSSync.retryFailed();
          paintWhite();
          paintSources();
        });
      }
    })();
