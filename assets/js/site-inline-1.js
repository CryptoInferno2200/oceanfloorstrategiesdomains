const n = new URLSearchParams(location.search).get("n") || "kelpchart.com";
    const out = OFSHost.ensure({ fqdn: n, businessName: n, description: "Live on OFS Host.", plan: "claim", listing: "both" });
    const site = out.site;
    document.title = site.businessName + " · " + site.fqdn;
    document.getElementById("host").textContent = site.fqdn + " · hosted here · TLS";
    document.getElementById("title").textContent = site.businessName;
    document.getElementById("desc").textContent = site.description || "";
    document.getElementById("meta").textContent = (site.plan || "claim") + " · listing " + (site.listing || "both");
