/** OFS Domains — AI run loop. One sentence operates the platform. */
(function (root) {
  const STEPS = [
    "Read the brief",
    "Pick the name",
    "Choose the product",
    "Set listing Both",
    "Fill the profile",
    "Route mail if needed",
    "Seal the ticket",
    "Issue the year",
    "Write the site",
    "Bind Haven + deed",
    "Seed the plot",
    "Go live or open pay",
  ];

  function words(text) {
    return String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  }

  function stem(sentence) {
    return (words(sentence).slice(0, 2).join("") || "ofsname").slice(0, 18);
  }

  function planOf(sentence) {
    const q = String(sentence || "").toLowerCase();
    if (/abyss|studio|store|game|team/.test(q)) return "abyss-one";
    if (/claim|just the name|name only|\$10/.test(q)) return "claim";
    return "one";
  }

  function listingOf(sentence) {
    const q = String(sentence || "").toLowerCase();
    if (/web3 only|on-?chain only/.test(q)) return "web3";
    if (/web only|site only/.test(q)) return "web";
    return "both";
  }

  function complimentary() {
    if (typeof OFSSeat === "undefined") return false;
    const s = OFSSeat.load();
    return Boolean(s.session && OFSSeat.free(s, s.session));
  }

  function run(opts) {
    const sentence = opts.sentence || "A kelp forest dashboard for the Gulf.";
    const businessName = opts.businessName || "Kelp Chart";
    const logoUrl = opts.logoUrl || "https://ofs.domains/mark.svg";
    const description = opts.description || sentence;
    const plan = opts.plan || planOf(sentence);
    const listing = opts.listing || listingOf(sentence);
    const fqdn = (opts.fqdn || stem(sentence) + ".com").toLowerCase();
    const free = complimentary();
    const quote = typeof OFSPrice !== "undefined"
      ? OFSPrice.quote({ bundle: plan, fqdn, listing, complimentary: free })
      : { due: free ? 0 : plan === "claim" ? 10 : plan === "abyss-one" ? 299 : 99, complimentary: free };
    const profile = { businessName, logoUrl, description, fqdn, plan, listing, at: Date.now() };
    try { localStorage.setItem("ofs.domains.profile.v1", JSON.stringify(profile)); } catch (_) {}
    try { localStorage.setItem("ofs.domains.receipt.v1", JSON.stringify({ fqdn, bundle: plan, listing, due: quote.due, complimentary: free, paidAt: new Date().toISOString() })); } catch (_) {}
    if (typeof OFSHost !== "undefined") OFSHost.publish({ fqdn, businessName, logoUrl, description, plan, listing });
    if (typeof OFSPurchases !== "undefined") OFSPurchases.add({ fqdn, plan, listing, due: quote.due, complimentary: free });
    const next = free || quote.due === 0
      ? "live.html?fqdn=" + encodeURIComponent(fqdn) + "&listing=" + listing + "&bundle=" + plan + "&due=0&complimentary=1"
      : "checkout.html?bundle=" + plan + "&listing=" + listing + "&fqdn=" + encodeURIComponent(fqdn);
    return { fqdn, plan, listing, quote, profile, free, steps: STEPS, next };
  }

  root.OFSRun = { STEPS, stem, planOf, listingOf, complimentary, run };
})(window);
