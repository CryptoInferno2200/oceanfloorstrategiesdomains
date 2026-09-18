const q = new URLSearchParams(location.search);
    const onlyName = q.get("only") === "name";
    const raw = onlyName ? "claim" : (q.get("bundle") || q.get("plan") || "one");
    const requestedListing = q.get("listing") || "both";
    const state = { plan: OFSPrice.BUNDLES[raw] ? raw : "one", term: "year", listing: ["web", "web3", "both"].includes(requestedListing) ? requestedListing : "both" };
    if (q.get("fqdn")) document.getElementById("fqdn").value = q.get("fqdn");

    let complimentarySeat = false;
    function complimentary() { return complimentarySeat; }

    function paintPlans() {
      const box = document.getElementById("plans");
      box.innerHTML = "";
      (onlyName ? ["claim"] : ["claim", "one", "abyss-one"]).forEach((id) => {
        const p = OFSPrice.BUNDLES[id];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pick" + (p.id === state.plan ? " on" : "");
        b.innerHTML = "<span class='k'>" + (id === "claim" ? "Name" : "All-in-one") + "</span><strong>" + p.name + "</strong><div class='price'>" +
          OFSPrice.money(p.year) + "<span class='k'> / year</span></div><p class='lead' style='margin:0;font-size:13px'>" + p.blurb + "</p>";
        b.addEventListener("click", () => { state.plan = p.id; paint(); });
        box.appendChild(b);
      });
    }

    function paint() {
      paintPlans();
      document.querySelectorAll("#listing [data-list]").forEach((el) => {
        el.classList.toggle("on", el.getAttribute("data-list") === state.listing);
      });
      const fqdn = document.getElementById("fqdn").value;
      const quote = OFSPrice.quote({
        plan: state.plan,
        tld: OFSPrice.tldOf(fqdn),
        listing: state.listing,
        term: state.term,
        complimentary: complimentary(),
      });
      document.getElementById("comp").hidden = !quote.complimentary;
      document.getElementById("lines").innerHTML = quote.lines.map((l) =>
        "<li><span>" + l.label + "</span><span>" + OFSPrice.money(l.amount) + "</span></li>"
      ).join("");
      document.getElementById("due").textContent = "Due " + OFSPrice.money(quote.due);
      document.getElementById("renew").textContent = "Renews " + OFSPrice.money(quote.renewsAt) + " · " + quote.names + " name" + (quote.names === 1 ? "" : "s");
      document.getElementById("pay").textContent = quote.due === 0 ? "Claim and go live" : "Pay " + OFSPrice.money(quote.due) + " and go live";
      window._quote = quote;
    }

    document.getElementById("fqdn").addEventListener("input", paint);
    document.querySelectorAll("#listing [data-list]").forEach((el) => {
      el.addEventListener("click", () => { state.listing = el.getAttribute("data-list"); paint(); });
    });
    document.getElementById("pay").addEventListener("click", async () => {
      const fqdn = (document.getElementById("fqdn").value || "kelpchart.com").trim().toLowerCase();
      const quote = window._quote;
      try {
        sessionStorage.setItem("ofs.receipt", JSON.stringify({ fqdn, quote, at: Date.now() }));
      } catch (_) {}
      const p = new URLSearchParams({
        fqdn,
        listing: quote.listing,
        bundle: quote.plan,
        due: String(quote.due),
        complimentary: quote.complimentary ? "1" : "0",
      });
      if (quote.due > 0) {
        const pay = document.getElementById("pay");
        pay.disabled = true;
        pay.textContent = "Opening secure checkout…";
        try {
          const response = await fetch("/api/create-checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fqdn, plan: quote.plan, listing: quote.listing }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) throw new Error(result.error || "Checkout could not start.");
          location.href = result.url;
        } catch (error) {
          pay.disabled = false;
          pay.textContent = "Try secure checkout again";
          const message = document.getElementById("renew");
          message.textContent = String(error.message || error);
        }
        return;
      }
      if (window.OFSHost) {
        OFSHost.publish({ fqdn, businessName: fqdn, plan: quote.plan, listing: quote.listing, description: "Hosted after checkout." });
      }
      if (window.OFSPurchases) {
        await OFSPurchases.add({
          fqdn,
          plan: quote.plan,
          listing: quote.listing,
          due: quote.due,
          complimentary: quote.complimentary,
          status: quote.due === 0 ? "complimentary" : "paid",
        });
      }
      location.href = "live.html?" + p.toString();
    });
    paint();
    fetch("/api/entitlement", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : { complimentary:false })
      .then((result) => { complimentarySeat = Boolean(result.complimentary); paint(); })
      .catch(() => {});
