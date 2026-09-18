const seat = OFSSeat.load().session;
    document.getElementById("who").textContent = seat ? ("Vault for " + seat) : "Vault on this device. Sign in on Home to attach a seat.";
    const rows = OFSPurchases.forAccount();
    const historyValues = rows.length
      ? rows.map((r) => {
          const pay = r.complimentary || r.due === 0 ? "complimentary" : "$" + Number(r.due).toFixed(2);
          return r.label + " · " + (r.fqdn || "—") + " · " + pay + " · " + new Date(r.at).toLocaleString();
        })
      : ["Vault is empty until a name is claimed or a plan is paid."];
    document.getElementById("history").replaceChildren(...historyValues.map((value) => {
      const row = document.createElement("li"); row.textContent = value; return row;
    }));
    const invited = OFSSeat.listWhitelist ? OFSSeat.listWhitelist() : [];
    const inviteValues = invited.length
      ? invited.map((r) => r.email + " · " + r.status + (r.operator ? " · operator" : ""))
      : ["No whitelist emails yet."];
    document.getElementById("white-list").replaceChildren(...inviteValues.map((value) => {
      const row = document.createElement("li"); row.textContent = value; return row;
    }));
