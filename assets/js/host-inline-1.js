function paint() {
      const rows = OFSHost.load();
      const list = document.getElementById("list");
      if (!rows.length) {
        const empty = document.createElement("li"); empty.textContent = "No previews saved on this device yet."; list.replaceChildren(empty); return;
      }
      list.replaceChildren(...rows.map((site) => {
        const row = document.createElement("li");
        const detail = document.createElement("span");
        const name = document.createTextNode(site.fqdn || "Unnamed site");
        const meta = document.createElement("span"); meta.className = "k"; meta.textContent = "Preview · this device only";
        detail.append(name, document.createElement("br"), meta);
        const link = document.createElement("a"); link.href = OFSHost.path(site.fqdn); link.textContent = "Open preview";
        row.append(detail, link); return row;
      }));
    }
    document.getElementById("form").onsubmit = (e) => {
      e.preventDefault();
      const out = OFSHost.publish({
        fqdn: document.getElementById("fqdn").value,
        businessName: document.getElementById("businessName").value,
        description: document.getElementById("description").value,
        plan: "claim",
        listing: "both",
      });
      if (out.ok) location.href = out.site.route;
    };
    paint();
