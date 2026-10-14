const zone = document.getElementById("zone");
    const file = document.getElementById("file");
    let pack = null;
    const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    // Strip protocol, path, leading www. and whitespace.
    function norm(v) {
      return String(v || "").toLowerCase().replace(/\s+/g, "")
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "")
        .replace(/^www\./, "").replace(/\.$/, "");
    }
    function showErr(t) { document.getElementById("err").textContent = t || ""; }
    async function eat(f) {
      showErr("");
      document.getElementById("ok").textContent = "Unpacking " + f.name + "…";
      try {
        pack = await OFSZip.unpack(f);
      } catch (err) {
        showErr(String(err.message || err));
        document.getElementById("ok").textContent = "";
        return;
      }
      document.getElementById("ok").textContent = "Ready. " + pack.count + " files.";
      document.getElementById("meta").hidden = false;
      document.getElementById("sum").textContent = pack.name + " · " + pack.kind + " · start " + (pack.start || "unknown");
      document.getElementById("fqdn").value = (pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand").slice(0, 63) + ".com";
      const tree = document.getElementById("tree");
      tree.replaceChildren(...pack.files.slice(0, 40).map((item) => {
        const row = document.createElement("li");
        row.textContent = item.path;
        return row;
      }));
    }
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); }
    });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("on"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("on"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("on");
      const f = e.dataTransfer.files[0];
      if (f) eat(f);
    });
    file.addEventListener("change", () => { if (file.files[0]) eat(file.files[0]); });
    document.getElementById("go").addEventListener("click", async () => {
      if (!pack) return;
      showErr("");
      const input = document.getElementById("fqdn");
      const fqdn = norm(input.value);
      if (!DOMAIN.test(fqdn)) { showErr("Enter a valid domain name, like yourbrand.com."); input.focus(); return; }
      input.value = fqdn;
      try {
        const project = await OFSZip.start(pack, fqdn);
        document.getElementById("live").hidden = false;
        document.getElementById("run").textContent = project.name + " is on Host. Preview is the start file; external resources and scripts may be blocked.";
        const href = OFSZip.preview(project);
        if (href) {
          const frame = document.getElementById("frame");
          if (frame.dataset.previewUrl) URL.revokeObjectURL(frame.dataset.previewUrl);
          frame.dataset.previewUrl = href;
          frame.src = href;
        }
        if (window.OFSHost) document.getElementById("toHost").href = OFSHost.path(project.id.includes(".") ? project.id : fqdn);
        document.getElementById("claim").href = "checkout.html?" + new URLSearchParams({ fqdn, bundle: "one" }).toString();
      } catch (err) {
        showErr(String(err.message || err));
      }
    });
