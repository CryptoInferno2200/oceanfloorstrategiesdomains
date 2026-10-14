const assistantBrief = sessionStorage.getItem("ofs.domains.ai-brief");
    if (assistantBrief) {
      document.getElementById("sentence").value = assistantBrief;
      document.getElementById("description").value = assistantBrief;
      sessionStorage.removeItem("ofs.domains.ai-brief");
    }
    document.getElementById("form").onsubmit = (e) => {
      e.preventDefault();
      const job = OFSRun.run({
        sentence: document.getElementById("sentence").value,
        businessName: document.getElementById("businessName").value,
        logoUrl: document.getElementById("logoUrl").value,
        description: document.getElementById("description").value,
      });
      document.getElementById("name").textContent = job.fqdn;
      const monthly = job.quote.term ? job.quote.term === "month" : job.plan === "abyss-one";
      document.getElementById("due").textContent = job.plan + " · listing " + job.listing + " · due $" + job.quote.due + (monthly ? " / month" : " / year") + " · availability checked at checkout";
      const ol = document.getElementById("steps");
      ol.replaceChildren(...job.steps.map((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        return li;
      }));
      document.getElementById("out").hidden = false;
      let i = 0;
      const tick = () => {
        // Only mark what has happened; checkout and registration come later.
        if (i < Math.min(job.now, ol.children.length)) {
          ol.children[i].classList.add("done");
          i += 1;
          setTimeout(tick, 220);
        } else {
          document.getElementById("live").textContent = job.free ? "Complimentary. Going live." : "Opening checkout. The name is not registered until payment completes.";
          location.href = job.next;
        }
      };
      job.saved.then((limit) => {
        if (!limit) return tick();
        document.getElementById("live").textContent = limit.error + " Opening Abyss One.";
        setTimeout(() => { location.href = limit.upgrade; }, 1600);
      });
    };
