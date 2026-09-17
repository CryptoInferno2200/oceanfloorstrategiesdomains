/** OFS Domains — purchase history for the signed-in seat. */
(function (root) {
  const KEY = "ofs.domains.purchases.v1";

  const LABELS = {
    claim: "Claim · name only",
    one: "OFS One",
    "abyss-one": "OFS Abyss One",
    tide: "Tide seat",
    abyss: "Abyss seat",
    reef: "Reef seat",
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function save(rows) {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-200)));
  }

  function account() {
    if (typeof OFSSeat === "undefined") return "";
    return OFSSeat.norm(OFSSeat.load().session || "");
  }

  async function add(opts) {
    const email = OFSSeat && opts.email ? OFSSeat.norm(opts.email) : account();
    const row = {
      id: "p" + Date.now().toString(36),
      email: email || "guest",
      fqdn: String(opts.fqdn || "").toLowerCase(),
      plan: opts.plan || "claim",
      label: LABELS[opts.plan] || opts.plan || "Service",
      listing: opts.listing || "both",
      due: Number(opts.due || 0),
      complimentary: Boolean(opts.complimentary),
      status: opts.status || (Number(opts.due || 0) === 0 ? "complimentary" : "paid"),
      at: opts.at || new Date().toISOString(),
    };
    const rows = load();
    const dup = rows.find((r) => r.fqdn === row.fqdn && r.plan === row.plan && Math.abs(new Date(r.at) - new Date(row.at)) < 15000);
    if (!dup) {
      rows.unshift(row);
      save(rows);
    }
    const saved = dup || row;
    if (email) {
      try {
        const response = await fetch("/api/purchases", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: saved.id,
            fqdn: saved.fqdn,
            plan: saved.plan,
            label: saved.label,
            listing: saved.listing,
            amountCents: Math.round(saved.due * 100),
            complimentary: saved.complimentary,
            status: saved.status,
            purchasedAt: saved.at,
          }),
        });
        if (!response.ok) throw new Error("Purchase history could not be synced.");
      } catch (_) {
        // Keep the local receipt available; the profile clearly labels its fallback state.
      }
    }
    return saved;
  }

  async function remote() {
    const response = await fetch("/api/purchases");
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in to load purchase history." : "Purchase history is unavailable.");
    const result = await response.json();
    return Array.isArray(result.purchases) ? result.purchases : [];
  }

  function forAccount(email) {
    const e = email ? String(email).toLowerCase() : account();
    const rows = load();
    if (!e) return rows;
    return rows.filter((r) => r.email === e || r.email === "guest");
  }

  root.OFSPurchases = { load, add, forAccount, remote, LABELS };
})(window);
