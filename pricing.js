/** OFS Domains crush sheet. Register = renew = transfer. Dual listing $0. */
(function (root) {
  const TLD_YEAR = {
    com: 10.99, net: 11.99, org: 10.99, app: 13.99,
    ai: 79.99, io: 39.99, studio: 19.99, store: 13.99, gg: 13.99,
  };
  const COM_CREDIT = 10.99;
  const CLAIM = 10;

  const STRIPE = {
    claim: "https://buy.stripe.com/00waEZccQcY86kv198eEo0c",
    one: "https://buy.stripe.com/8x214p1ycaQ08sDaJIeEo0d",
    "abyss-one": "https://buy.stripe.com/cNieVf3Gk8HScITaJIeEo0e",
  };

  const PLANS = {
    claim: {
      id: "claim", name: "Claim", kind: "claim",
      month: null, year: CLAIM, names: 1,
      blurb: "Name year $10. Both listings $0. Plot and bind stay on.",
      includes: [
        "1 name year · $10",
        "Web + Web3 · $0 extra",
        "Plot + Haven bind",
        "Privacy + SSL",
      ],
    },
    reef: {
      id: "reef", name: "Reef", kind: "seat",
      month: 0, year: 0, names: 1,
      blurb: "Year + Both + plot + Haven bind + 1 page",
    },
    tide: {
      id: "tide", name: "Tide", kind: "seat",
      month: 14, year: 108, names: 10,
      blurb: "AI web + app, launch kit, brand token, mail forward",
    },
    abyss: {
      id: "abyss", name: "Abyss", kind: "seat",
      month: 39, year: 348, names: 50,
      blurb: "Store / studio / game, team, priority generate",
    },
    one: {
      id: "one", name: "OFS One", kind: "bundle",
      month: null, year: 99, names: 1, seat: "tide",
      blurb: "1 name year, Tide, Both listings, plot, deed, token",
      includes: [
        "1 name year (.com credit $10.99)",
        "Web + Web3 · $0 extra",
        "Tide — AI web + app",
        "Launch kit + plot + Haven deed",
        "Brand token in Haven",
        "Privacy, SSL, 5 mail forwards",
      ],
    },
    "abyss-one": {
      id: "abyss-one", name: "OFS Abyss One", kind: "bundle",
      month: null, year: 299, names: 5, seat: "abyss",
      blurb: "5 names, Abyss seat, Both on every name",
      includes: [
        "5 name years (each with a .com credit)",
        "Web + Web3 on every name",
        "Abyss — store / studio / game",
        "Team + priority generate",
        "Plot + deed each",
        "Privacy, SSL, 25 mail forwards",
      ],
    },
  };

  function money(n) {
    return "$" + Number(n).toFixed(2).replace(/\.00$/, "");
  }

  function parseName(fqdn) {
    const n = String(fqdn || "kelpchart.com").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const i = n.lastIndexOf(".");
    if (i <= 0) return { fqdn: n || "kelpchart.com", tld: "com" };
    return { fqdn: n, tld: n.slice(i + 1) };
  }

  function tldOf(fqdn) {
    return parseName(fqdn).tld;
  }

  function tldYear(tld) {
    return TLD_YEAR[tld] || COM_CREDIT;
  }

  function quote(opts) {
    const parsed = parseName(opts.fqdn || "kelpchart.com");
    const plan = PLANS[opts.plan || opts.bundle] || PLANS.one;
    const tld = opts.tld || parsed.tld;
    const listing = opts.listing || "both";
    const term = opts.term === "month" && plan.month != null ? "month" : "year";
    const complimentary = Boolean(opts.complimentary);
    const tldCost = plan.kind === "claim" && (tld === "com" || tld === "org") ? CLAIM : tldYear(tld);
    const credit = plan.kind === "claim" ? CLAIM : COM_CREDIT;
    const billedName = plan.kind === "bundle" || plan.kind === "claim";
    const surcharge = billedName ? Math.max(0, Math.round((tldCost - credit) * 100) / 100) : 0;
    const base = term === "month" ? plan.month : plan.year;
    const nameLine = billedName ? 0 : (term === "year" ? tldCost : 0);
    let due = Math.round((base + surcharge + nameLine) * 100) / 100;
    if (complimentary) due = 0;
    const renewsAt = complimentary ? 0 : (billedName ? plan.year + surcharge : (term === "month" ? plan.month : plan.year + tldCost));
    const lines = [];
    if (billedName) {
      lines.push({ label: plan.name + " · year", amount: complimentary ? 0 : plan.year });
      lines.push({ label: "." + tld + " credit inside", amount: 0 });
      if (surcharge) lines.push({ label: "." + tld + " above credit", amount: complimentary ? 0 : surcharge });
    } else {
      lines.push({ label: plan.name + " · " + term, amount: complimentary ? 0 : base });
      if (term === "year") lines.push({ label: "." + tld + " year", amount: complimentary ? 0 : tldCost });
    }
    lines.push({ label: "Listing " + listing, amount: 0 });
    lines.push({ label: "Domain Privacy Protection", amount: 0 });
    lines.push({ label: "OFS Hosting", amount: 0 });
    lines.push({ label: "SSL / TLS certificate", amount: 0 });
    lines.push({ label: "Plot · deed", amount: 0 });
    return {
      plan: plan.id,
      planName: plan.name,
      kind: plan.kind,
      term,
      tld,
      listing,
      complimentary,
      due,
      renewsAt,
      lines,
      names: plan.names,
      privacy: true,
      parsed,
      bundle: plan,
      surcharge,
    };
  }

  const BUNDLES = { claim: PLANS.claim, one: PLANS.one, "abyss-one": PLANS["abyss-one"] };
  root.OFSPrice = { TLD_YEAR, COM_CREDIT, CLAIM, STRIPE, PLANS, BUNDLES, money, tldOf, tldYear, quote, parseName };
})(window);
