/** OFS Domains — hosting preview. Saves a name + site preview on this device only; nothing is served publicly.
 *  Real hosting comes with OFS One / Sauce at /s/<slug> or by pointing the name's DNS at Netlify. */
(function (root) {
  const KEY = "ofs.domains.host.v1";
  // Older builds seeded this demo row on first visit; it is hidden so it never looks like a real site.
  const LEGACY_DEMO = "Live kelp cover for the Gulf. Hosted on OFS Domains.";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((r) => r && !(r.fqdn === "kelpchart.com" && r.description === LEGACY_DEMO)) : [];
    } catch {
      return [];
    }
  }

  function save(rows) {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-80)));
  }

  function norm(fqdn) {
    return String(fqdn || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
  }

  function path(fqdn) {
    return "site.html?n=" + encodeURIComponent(norm(fqdn));
  }

  function get(fqdn) {
    const n = norm(fqdn);
    return load().find((r) => r.fqdn === n) || null;
  }

  function ensure(opts) {
    const existing = get(opts.fqdn || opts);
    if (existing) return { ok: true, site: existing, created: false };
    return Object.assign(publish(typeof opts === "string" ? { fqdn: opts } : opts), { created: true });
  }

  // Kept for callers that still invoke it; no demo data is created any more.
  function seed() {
    return load();
  }

  function publish(opts) {
    const fqdn = norm(opts.fqdn);
    if (!fqdn) return { ok: false, error: "Need a name." };
    const site = {
      fqdn,
      businessName: opts.businessName || fqdn,
      logoUrl: opts.logoUrl || "",
      description: opts.description || "",
      plan: opts.plan || "claim",
      listing: opts.listing || "both",
      privacy: opts.privacy !== false,
      preview: true,
      route: path(fqdn),
      publishedAt: new Date().toISOString(),
    };
    const rows = load().filter((r) => r.fqdn !== fqdn);
    rows.unshift(site);
    save(rows);
    return { ok: true, site };
  }

  root.OFSHost = { load, get, ensure, seed, publish, path, norm };
})(window);
