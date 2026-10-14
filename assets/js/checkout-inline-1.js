const q = new URLSearchParams(location.search);
    const onlyName = q.get("only") === "name";
    const raw = onlyName ? "claim" : (q.get("bundle") || q.get("plan") || "one");
    const requestedListing = q.get("listing") || "both";
    const state = { plan: OFSPrice.BUNDLES[raw] ? raw : "one", term: "year", listing: ["web", "web3", "both"].includes(requestedListing) ? requestedListing : "both" };
    const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    const field = document.getElementById("fqdn");
    const msg = document.getElementById("msg");

    // Strip protocol, path, leading www. and whitespace.
    function norm(v) {
      return String(v || "").toLowerCase().replace(/\s+/g, "")
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "")
        .replace(/^www\./, "").replace(/\.$/, "");
    }
    function say(t) { msg.textContent = t || ""; }

    if (q.get("fqdn")) field.value = norm(q.get("fqdn"));

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
        b.setAttribute("aria-pressed", String(p.id === state.plan));
        b.innerHTML = "<span class='k'>" + (id === "claim" ? "Name" : "All-in-one") + "</span><strong>" + p.name + "</strong><div class='price'>" +
          OFSPrice.money(OFSPrice.priceOf(p)) + "<span class='k'> / " + OFSPrice.cycleOf(p) + "</span></div><p class='lead' style='margin:0;font-size:13px'>" + p.blurb + "</p>";
        b.addEventListener("click", () => { state.plan = p.id; paint(); });
        box.appendChild(b);
      });
    }

    function paint() {
      paintPlans();
      document.querySelectorAll("#listing [data-list]").forEach((el) => {
        const on = el.getAttribute("data-list") === state.listing;
        el.classList.toggle("on", on);
        el.setAttribute("aria-pressed", String(on));
      });
      const fqdn = norm(field.value);
      const quote = OFSPrice.quote({
        plan: state.plan,
        tld: OFSPrice.tldOf(fqdn),
        listing: state.listing,
        term: state.term,
        complimentary: complimentary(),
      });
      document.getElementById("comp").hidden = !quote.complimentary;
      document.getElementById("lines").replaceChildren(...quote.lines.map((l) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        const amount = document.createElement("span");
        label.textContent = l.label;
        amount.textContent = OFSPrice.money(l.amount);
        li.append(label, amount);
        return li;
      }));
      document.getElementById("due").textContent = "Due " + OFSPrice.money(quote.due) + (quote.term === "month" ? " / month" : "");
      document.getElementById("renew").textContent = "Renews " + OFSPrice.money(quote.renewsAt) + " / " + quote.term + " · " + quote.names + " name" + (quote.names === 1 ? "" : "s");
      document.getElementById("pay").textContent = quote.due === 0 ? "Claim and go live" : "Pay " + OFSPrice.money(quote.due) + " and go live";
      window._quote = quote;
    }

    field.addEventListener("input", () => { say(""); paint(); });
    document.querySelectorAll("#listing [data-list]").forEach((el) => {
      el.addEventListener("click", () => { state.listing = el.getAttribute("data-list"); paint(); });
    });
    document.getElementById("pay").addEventListener("click", async () => {
      const pay = document.getElementById("pay");
      if (pay.disabled) return;
      say("");
      const fqdn = norm(field.value);
      if (!fqdn) { say("Enter the name you want, like yourbrand.com."); field.focus(); return; }
      if (!DOMAIN.test(fqdn)) { say("“" + fqdn + "” is not a valid domain name. Use something like yourbrand.com."); field.focus(); return; }
      const tld = OFSPrice.tldOf(fqdn);
      if (!OFSPrice.TLD_YEAR[tld]) {
        say("We don't sell ." + tld + " names yet. Try ." + Object.keys(OFSPrice.TLD_YEAR).join(", ."));
        field.focus();
        return;
      }
      field.value = fqdn;
      paint();
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
        pay.disabled = true;
        pay.setAttribute("aria-busy", "true");
        pay.textContent = "Checking availability…";
        try {
          const response = await fetch("/api/create-checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fqdn, plan: quote.plan, listing: quote.listing }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) {
            const fallback = response.status === 409 ? fqdn + " is not available. Try another name."
              : response.status === 400 ? "That name can't be registered here."
              : response.status === 503 ? "Registration is temporarily unavailable. You have not been charged."
              : "Checkout could not start. You have not been charged.";
            throw new Error(result.error || fallback);
          }
          pay.textContent = "Opening secure checkout…";
          location.href = result.url;
        } catch (error) {
          pay.disabled = false;
          pay.removeAttribute("aria-busy");
          pay.textContent = "Try secure checkout again";
          say(String(error.message || error));
          field.focus();
        }
        return;
      }
      pay.disabled = true;
      if (window.OFSHost) {
        OFSHost.publish({ fqdn, businessName: fqdn, plan: quote.plan, listing: quote.listing, description: "Hosted after checkout." });
      }
      if (window.OFSPurchases) {
        try {
          await OFSPurchases.add({
            fqdn,
            plan: quote.plan,
            listing: quote.listing,
            due: quote.due,
            complimentary: quote.complimentary,
            status: quote.due === 0 ? "complimentary" : "paid",
          });
        } catch (_) {}
      }
      location.href = "live.html?" + p.toString();
    });
    paint();
    fetch("/api/entitlement", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : { complimentary:false })
      .then((result) => { complimentarySeat = Boolean(result.complimentary); paint(); })
      .catch(() => {});
