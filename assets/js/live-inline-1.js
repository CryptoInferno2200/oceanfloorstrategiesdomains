const q = new URLSearchParams(location.search);
    const fqdn = (q.get("fqdn") || "kelpchart.com").toLowerCase();
    const listing = q.get("listing") || "both";
    const name = q.get("businessName") || fqdn;
    document.getElementById("title").textContent = fqdn;
    const due = q.get("due");
    const comp = q.get("complimentary") === "1";
    const bundle = q.get("bundle") || "";
    document.getElementById("sub").textContent = name + " · listing " + listing + " · $0 extra" + (comp ? " · complimentary" : "");
    const rows = [];
    if (bundle) {
      const label = bundle === "abyss-one" ? "OFS Abyss One" : bundle === "one" ? "OFS One" : bundle === "claim" ? "Claim" : bundle;
      rows.push(label + (due != null ? " · due $" + due : ""));
    }
    rows.push(fqdn + " year (ICANN)");
    rows.push("Listing " + listing + " · $0 extra");
    rows.push("Domain Privacy Protection · $0");
    if (listing !== "web3") rows.push("Hosted at site.html?n=" + fqdn);
    if (listing !== "web") {
      rows.push("Name deed in Haven");
      rows.push("Reef plot /reef/" + fqdn);
    }
    if (q.get("brandToken") !== "false" && listing !== "web") rows.push("Brand token to Haven (not a sale)");
    document.getElementById("list").replaceChildren(...rows.map((value) => {
      const row = document.createElement("li");
      row.textContent = value;
      return row;
    }));
    const carry = "?fqdn=" + encodeURIComponent(fqdn);
    document.getElementById("toReef").href = "reef.html" + carry;
    document.getElementById("toBind").href = "bind.html" + carry;
    if (typeof OFSHost !== "undefined") {
      OFSHost.publish({ fqdn, businessName: name, plan: bundle || "claim", listing });
      const hostBtn = document.getElementById("toHost");
      if (hostBtn) hostBtn.href = OFSHost.path(fqdn);
    }
    document.querySelectorAll("nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        location.href = a.getAttribute("href").split("?")[0] + carry;
      });
    });
