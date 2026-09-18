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
      document.getElementById("due").textContent = job.plan + " · listing " + job.listing + " · due $" + job.quote.due;
      const ol = document.getElementById("steps");
      ol.innerHTML = job.steps.map((s) => "<li>" + s + "</li>").join("");
      document.getElementById("out").hidden = false;
      let i = 0;
      const tick = () => {
        if (i < ol.children.length) {
          ol.children[i].classList.add("done");
          i += 1;
          setTimeout(tick, 220);
        } else {
          document.getElementById("live").textContent = job.free ? "Complimentary. Going live." : "Opening checkout.";
          location.href = job.next;
        }
      };
      tick();
    };
