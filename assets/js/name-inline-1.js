document.getElementById("form").onsubmit = async (e) => {
      e.preventDefault();
      const fqdn = document.getElementById("fqdn").value.trim().toLowerCase();
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
      if (window.OFSPurchases) {
        OFSPurchases.add({ fqdn: quote.parsed.fqdn, plan: "claim", listing: "both", due: free ? 0 : quote.due, complimentary: free });
      }
      OFSHost.publish({
        fqdn: quote.parsed.fqdn,
        businessName: quote.parsed.fqdn,
        description: "Name-only. Point this name at the site you already run, or use the OFS host page.",
        plan: "claim",
        listing: "both",
      });
      const hosted = OFSHost.path(quote.parsed.fqdn);
      if (free || quote.due === 0) {
        location.href = "live.html?fqdn=" + encodeURIComponent(quote.parsed.fqdn) + "&listing=both&bundle=claim&due=0&complimentary=1&only=name";
        return;
      }
      sessionStorage.setItem("ofs.domains.next.host", hosted);
      location.href = "checkout.html?bundle=claim&listing=both&only=name&fqdn=" + encodeURIComponent(quote.parsed.fqdn);
    };
