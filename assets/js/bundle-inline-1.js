const ORDER = ["claim", "one", "abyss-one"];
    const box = document.getElementById("products");
    ORDER.forEach((id, i) => {
      const p = OFSPrice.BUNDLES[id];
      const art = document.createElement("article");
      art.className = "card" + (id === "one" ? " on" : "");
      art.innerHTML =
        "<div class='k'>" + (id === "claim" ? "Name only" : id === "one" ? "Most names" : "Studios") + "</div>" +
        "<h2>" + p.name + "</h2>" +
        "<p class='price'>" + OFSPrice.money(p.year) + "<span class='k'> / year</span></p>" +
        "<ul>" + (p.includes || []).map((x) => "<li>" + x + "</li>").join("") + "</ul>" +
        "<a class='btn" + (id === "claim" || id === "one" ? "" : " ghost") + "' href='checkout.html?bundle=" + id + "&listing=both'>Checkout · " + OFSPrice.money(p.year) + "</a>";
      box.appendChild(art);
    });
