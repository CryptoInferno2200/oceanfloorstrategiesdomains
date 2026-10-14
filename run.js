/** OFS Domains — AI run loop. One sentence operates the platform. */
(function (root) {
  // First NOW steps run here; the rest happen at checkout and after payment.
  const STEPS = [
    "Read the brief",
    "Suggest a name",
    "Choose the plan and listing",
    "Save the profile and draft site",
    "Open checkout",
    "Check availability with the registrar",
    "After payment: register the name with WHOIS privacy",
    "Track registration status in Profile",
    "Haven / Web3 binding (preview)",
  ];
  const NOW = 5;
  const STOP = new Set(["a", "an", "the", "for", "my", "of", "and", "to", "with", "in", "on"]);

  function words(text) {
    return String(text || "").toLowerCase().match(/[a-z]+/g) || [];
  }

  function stem(sentence) {
    return (words(sentence).filter((w) => !STOP.has(w)).slice(0, 2).join("") || "ofsname").slice(0, 18);
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
    return false;
  }

  function run(opts) {
    const sentence = opts.sentence || "A kelp forest dashboard for the Gulf.";
    const businessName = opts.businessName || "Kelp Chart";
    const logoUrl = opts.logoUrl || "./icon.svg";
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
    try { localStorage.setItem("ofs.domains.receipt.v1", JSON.stringify({ fqdn, bundle: plan, listing, due: quote.due, complimentary: free, status: "awaiting-payment", quotedAt: new Date().toISOString() })); } catch (_) {}
    if (typeof OFSHost !== "undefined") OFSHost.publish({ fqdn, businessName, logoUrl, description, plan, listing });
    // Local quote only; the real receipt is recorded server-side after payment.
    // Saves the project to the signed-in account; guests keep the local copy only.
    // Resolves with the upgrade path when the account is over its project limit.
    let saved = Promise.resolve(null);
    try {
      saved = fetch("/api/projects", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fqdn, name: businessName, description, plan, listing }),
      })
        .then((response) => response.status === 402 ? response.json().catch(() => ({})) : null)
        .then((result) => result ? { error: result.error || "Project limit reached.", upgrade: result.upgrade || "checkout.html?bundle=abyss-one&listing=both" } : null)
        .catch(() => null);
    } catch (_) {}
    const next = free || quote.due === 0
      ? "live.html?fqdn=" + encodeURIComponent(fqdn) + "&listing=" + listing + "&bundle=" + plan + "&due=0&complimentary=1"
      : "checkout.html?bundle=" + plan + "&listing=" + listing + "&fqdn=" + encodeURIComponent(fqdn);
    return { fqdn, plan, listing, quote, profile, free, steps: STEPS, now: NOW, next, saved };
  }

  root.OFSRun = { STEPS, NOW, stem, planOf, listingOf, complimentary, run };
})(window);
