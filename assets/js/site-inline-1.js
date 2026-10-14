// Preview only: reads a preview saved on this device and never creates one on visit.
    const n = OFSHost.norm(new URLSearchParams(location.search).get("n") || "");
    const site = (n && OFSHost.get(n)) || null;
    if (site) {
      document.title = "Preview · " + (site.businessName || site.fqdn);
      document.getElementById("host").textContent = site.fqdn + " · site preview";
      document.getElementById("title").textContent = site.businessName || site.fqdn;
      document.getElementById("desc").textContent = site.description || "";
      document.getElementById("meta").textContent = "Listing " + (site.listing || "both") + " · saved on this device";
    } else {
      document.getElementById("host").textContent = n ? n + " · site preview" : "Site preview";
      document.getElementById("title").textContent = n || "No preview yet";
      document.getElementById("desc").textContent = "No preview is saved on this device for this name. Create one in the Claim name site preview step.";
    }
