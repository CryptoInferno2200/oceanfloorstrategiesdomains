const params = new URLSearchParams(location.search);
    const email = OFSSeat.norm(params.get("e") || "");
    const token = String(params.get("t") || "").trim();
    const title = document.getElementById("title");
    const msg = document.getElementById("msg");

    (async () => {
      if (!OFSSeat.valid(email) || token.length < 32) {
        title.textContent = "Link is incomplete.";
        msg.textContent = "Ask for a new verify message to that inbox.";
        history.replaceState({}, "", "verify.html");
        return;
      }
      const result = await OFSSeat.consumeToken(email, token);
      history.replaceState({}, "", "verify.html");
      if (!result.ok) {
        title.textContent = "Could not verify.";
        msg.textContent = result.error;
        return;
      }
      title.textContent = "Inbox confirmed.";
      msg.textContent = result.already
        ? "This seat was already verified. You can sign in."
        : "That inbox owns this seat. Free year is on. Sign in with the password you set.";
    })();
