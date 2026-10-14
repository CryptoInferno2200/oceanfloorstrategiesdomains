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

  function localId() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === "function") return "local-" + root.crypto.randomUUID();
    } catch (_) {}
    return "local-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  async function add(opts) {
    const seat = typeof OFSSeat !== "undefined" ? OFSSeat : null;
    const email = seat && opts.email ? seat.norm(opts.email) : account();
    const row = {
      // Local cache id only; the server generates the real purchase id.
      id: localId(),
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
    // Signed out: never show receipts saved for other accounts or guests on this device.
    if (!e) return [];
    return load().filter((r) => r.email === e);
  }

  root.OFSPurchases = { load, add, forAccount, remote, LABELS };
})(window);
