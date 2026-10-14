const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    const field = document.getElementById("fqdn");
    const err = document.getElementById("err");
    // Strip protocol, path, leading www. and whitespace.
    function norm(v) {
      return String(v || "").toLowerCase().replace(/\s+/g, "")
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "")
        .replace(/^www\./, "").replace(/\.$/, "");
    }
    // Price for the entered TLD; "from $10" until a sold TLD is typed.
    function paint() {
      const fqdn = norm(field.value);
      const tld = fqdn.includes(".") ? OFSPrice.tldOf(fqdn) : "";
      const sold = tld && OFSPrice.TLD_YEAR[tld];
      const due = sold ? OFSPrice.quote({ bundle: "claim", fqdn, listing: "both" }).due : 0;
      const price = sold ? OFSPrice.money(due) : "from " + OFSPrice.money(OFSPrice.CLAIM);
      document.getElementById("price").textContent = "Claim · " + price + " / year" + (sold ? " for ." + tld : "");
      document.getElementById("buy").textContent = "Buy name · " + price;
    }
    field.addEventListener("input", () => { err.textContent = ""; paint(); });
    paint();
    document.getElementById("form").onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = "";
      const fqdn = norm(field.value);
      if (!DOMAIN.test(fqdn)) { err.textContent = "Enter a valid domain name, like yourbrand.com."; field.focus(); return; }
      const tld = OFSPrice.tldOf(fqdn);
      if (!OFSPrice.TLD_YEAR[tld]) {
        err.textContent = "We don't sell ." + tld + " names yet. Try ." + Object.keys(OFSPrice.TLD_YEAR).join(", .");
        field.focus();
        return;
      }
      let free = false;
      try {
        const response = await fetch("/api/entitlement", { headers: { Accept: "application/json" } });
        const entitlement = response.ok ? await response.json() : {};
        free = Boolean(entitlement.complimentary);
      } catch (_) {}
      const quote = OFSPrice.quote({ bundle: "claim", fqdn, listing: "both", complimentary: free });
      if (!free && quote.due > 0) {
        location.href = "checkout.html?bundle=claim&listing=both&only=name&fqdn=" + encodeURIComponent(quote.parsed.fqdn);
        return;
      }
      // Complimentary only from here.
      if (window.OFSPurchases) {
        try {
          await OFSPurchases.add({ fqdn: quote.parsed.fqdn, plan: "claim", listing: "both", due: 0, complimentary: true });
        } catch (_) {}
      }
      if (window.OFSHost) {
        OFSHost.publish({
          fqdn: quote.parsed.fqdn,
          businessName: quote.parsed.fqdn,
          description: "Name-only. Point this name at the site you already run, or use the OFS host page.",
          plan: "claim",
          listing: "both",
        });
      }
      location.href = "live.html?fqdn=" + encodeURIComponent(quote.parsed.fqdn) + "&listing=both&bundle=claim&due=0&complimentary=1&only=name";
    };
