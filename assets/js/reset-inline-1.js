const params = new URLSearchParams(location.search);
    const email = OFSSeat.norm(params.get("e") || "");
    const token = String(params.get("t") || "").trim();
    if (!OFSSeat.valid(email) || token.length < 32) {
      document.getElementById("title").textContent = "Link is incomplete.";
      document.getElementById("form").hidden = true;
      document.getElementById("msg").textContent = "Ask for a new reset from Sign in.";
    }
    document.getElementById("toggle-passwords").addEventListener("click", (event) => {
      const fields = [document.getElementById("password"), document.getElementById("again")];
      const reveal = fields[0].type === "password";
      fields.forEach((field) => { field.type = reveal ? "text" : "password"; });
      event.currentTarget.textContent = reveal ? "Hide passwords" : "Show passwords";
      event.currentTarget.setAttribute("aria-pressed", String(reveal));
    });
    document.getElementById("form").onsubmit = async (e) => {
      e.preventDefault();
      const pass = document.getElementById("password").value;
      const again = document.getElementById("again").value;
      document.getElementById("err").textContent = "";
      if (pass !== again) { document.getElementById("err").textContent = "Passwords do not match."; return; }
      const result = await OFSSeat.consumeReset(email, token, pass);
      if (!result.ok) { document.getElementById("err").textContent = result.error; return; }
      history.replaceState({}, "", "reset.html");
      document.getElementById("form").hidden = true;
      document.getElementById("title").textContent = "Password saved.";
      document.getElementById("msg").textContent = "That inbox can sign in with the new password.";
    };
