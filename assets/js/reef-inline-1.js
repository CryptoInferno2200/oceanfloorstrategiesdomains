const SPECIES = { com:"Staghorn", net:"Kelp hold", org:"Brain coral", app:"Sea fan", ai:"Biolume polyps", io:"Table coral", studio:"Gorgonian", store:"Barrel sponge", gg:"Table coral" };
    function split(fqdn) {
      const n = (fqdn || "").trim().toLowerCase();
      const i = n.lastIndexOf(".");
      if (i <= 0) return { fqdn: "kelpchart.com", tld: "com" };
      return { fqdn:n, tld:n.slice(i+1) };
    }
    async function sha256(s) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
    }
    function paint(raw) {
      const { fqdn, tld } = split(raw);
      document.getElementById("title").textContent = fqdn;
      const c = document.getElementById("reef");
      const ctx = c.getContext("2d");
      const w = c.width, h = c.height;
      sha256(fqdn).then(seed => {
        const H = parseInt(seed.slice(0,4), 16) % 360;
        const g = ctx.createLinearGradient(0,0,0,h);
        g.addColorStop(0,"#07222c"); g.addColorStop(1,"#041016");
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle = `hsl(${H} 48% 50%)`;
        ctx.lineCap = "round"; ctx.lineWidth = 2.2;
        const cx = w/2, cy = h*0.82;
        for (let i=0;i<5;i++) {
          const a = -Math.PI/2 + (i-2)*0.32;
          ctx.beginPath(); ctx.moveTo(cx,cy);
          ctx.lineTo(cx+Math.cos(a)*90, cy+Math.sin(a)*90); ctx.stroke();
        }
        document.getElementById("line").textContent = (SPECIES[tld] || "Staghorn") + " hashed from " + fqdn;
      });
    }
    const start = new URLSearchParams(location.search).get("fqdn") || "kelpchart.com";
    document.getElementById("fqdn").value = start;
    paint(start);
    document.getElementById("fqdn").addEventListener("input", (e) => paint(e.target.value));
    document.querySelectorAll("nav a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        location.href = a.getAttribute("href").split("?")[0] + "?fqdn=" + encodeURIComponent(split(document.getElementById("fqdn").value).fqdn);
      });
    });
