const SPECIES = { com:"Staghorn", net:"Kelp hold", org:"Brain coral", app:"Sea fan", ai:"Biolume polyps", io:"Table coral", studio:"Gorgonian", store:"Barrel sponge", gg:"Table coral" };
    function qname() {
      return new URLSearchParams(location.search).get("fqdn") || "";
    }
    function split(fqdn) {
      const n = (fqdn || "").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"");
      const i = n.lastIndexOf(".");
      if (i <= 0) return { fqdn:n || "example.com", sld: n.split(".")[0] || "example", tld: "com" };
      return { fqdn:n, sld:n.slice(0,i), tld:n.slice(i+1) };
    }
    function carry(href) {
      const n = split(document.getElementById("fqdn").value).fqdn;
      return href + "?fqdn=" + encodeURIComponent(n);
    }
    async function sha256(s) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
    }
    function hue(hex) { return parseInt(hex.slice(0,4), 16) % 360; }
    function paint(fqdn, bound) {
      const c = document.getElementById("reef");
      const ctx = c.getContext("2d");
      const w = c.width, h = c.height;
      const { tld, fqdn: name } = split(fqdn);
      sha256(fqdn).then(seed => {
        const H = hue(seed);
        const g = ctx.createLinearGradient(0,0,0,h);
        g.addColorStop(0,"#07222c"); g.addColorStop(1,"#041016");
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        ctx.fillStyle = "rgba(20,40,38,.55)";
        ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(0,h*0.78); ctx.quadraticCurveTo(w/2,h*0.7,w,h*0.8); ctx.lineTo(w,h); ctx.fill();
        ctx.strokeStyle = `hsl(${H} 48% 50%)`;
        ctx.lineCap = "round"; ctx.lineWidth = 2.2;
        const cx = w/2, cy = h*0.82;
        for (let i=0;i<5;i++) {
          const a = -Math.PI/2 + (i-2)*0.32;
          ctx.beginPath(); ctx.moveTo(cx,cy);
          ctx.lineTo(cx+Math.cos(a)*90, cy+Math.sin(a)*90); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*90, cy+Math.sin(a)*90);
          ctx.lineTo(cx+Math.cos(a-0.5)*120, cy+Math.sin(a-0.5)*120); ctx.stroke();
        }
        if (bound) {
          ctx.fillStyle = `hsla(${H} 80% 70% / .18)`;
          ctx.beginPath(); ctx.arc(cx, cy-40, 70, 0, Math.PI*2); ctx.fill();
        }
        const spec = SPECIES[tld] || "Staghorn";
        const caption = bound
          ? spec + " · preview bind to an illustrative Haven wallet · not on-chain"
          : spec + " · preview plot";
        document.getElementById("line").textContent = caption;
        c.setAttribute("aria-label", "Illustrative reef plot for " + name + ": " + caption);
      });
    }
    document.getElementById("preview").onclick = () => {
      document.getElementById("out").hidden = true;
      paint(document.getElementById("fqdn").value, false);
    };
    document.getElementById("bind").onclick = async () => {
      if (listing === "web") {
        document.getElementById("intent").textContent = "Web only. Turn on Both or Web3 to bind Haven.";
        document.getElementById("dns").replaceChildren();
        document.getElementById("out").hidden = false;
        return;
      }
      const fqdn = split(document.getElementById("fqdn").value).fqdn;
      // Illustrative values only: both are SHA-256 hashes of the name, not real on-chain addresses.
      const wallet = "0xHAVEN" + (await sha256(fqdn)).slice(0,34);
      const node = "0x" + await sha256(fqdn);
      paint(fqdn, true);
      document.getElementById("intent").textContent =
        `OFS Haven bind (preview — not on-chain)\nname: ${fqdn}\nnode: ${node} (illustrative hash)\nwallet: ${wallet} (illustrative hash)`;
      const records = [
        `TXT @ "OFS1 ${wallet}" (illustrative)`,
        `TXT _ens "a=${wallet}" (illustrative — not an ENS record)`,
        "ALIAS @ your-site-host.example. (placeholder target)",
        "CNAME www your-site-host.example. (placeholder target)",
      ];
      document.getElementById("dns").replaceChildren(...records.map((value) => {
        const li = document.createElement("li"); li.textContent = value; return li;
      }));
      document.getElementById("out").hidden = false;
    };
    let listing = "both";
    document.querySelectorAll("[data-list]").forEach((b) => {
      b.addEventListener("click", () => {
        listing = b.getAttribute("data-list");
        document.querySelectorAll("[data-list]").forEach((x) => {
          x.classList.toggle("ghost", x !== b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        const copy = {
          both: "Web + Web3 is on. Same year. Same letters. $0 extra.",
          web: "Web only. Site and mail. Add Web3 later — still $0.",
          web3: "Web3 only. Deed, bind, plot. Turn the site on later — $0.",
        };
        document.getElementById("listline").textContent = copy[listing];
        paint(document.getElementById("fqdn").value, listing !== "web");
        if (listing === "web") document.getElementById("out").hidden = true;
      });
    });
    const start = qname();
    if (start) document.getElementById("fqdn").value = start;
    document.querySelectorAll("nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href").split("?")[0];
        if (href.endsWith(".html")) {
          e.preventDefault();
          location.href = carry(href);
        }
      });
    });
    paint(document.getElementById("fqdn").value, false);
