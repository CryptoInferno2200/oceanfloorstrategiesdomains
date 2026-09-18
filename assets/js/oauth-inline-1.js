const title = document.getElementById("title");
    const msg = document.getElementById("msg");
    (async () => {
      const got = OFSOAuth.parseHash();
      history.replaceState({}, "", "oauth.html");
      if (got.error) { title.textContent = "Google cancelled."; msg.textContent = got.error; return; }
      if (!got.idToken) { title.textContent = "No token."; msg.textContent = "Start again from Continue with Google."; return; }
      let info;
      try { info = await OFSOAuth.inspect(got.idToken); }
      catch (err) { title.textContent = "Token rejected."; msg.textContent = String(err.message || err); return; }
      const email = OFSSeat.norm(info.email || "");
      const googleVerified = info.email_verified === "true" || info.email_verified === true;
      if (!OFSSeat.valid(email)) { title.textContent = "No email on that Google account."; return; }
      const state = OFSSeat.load();
      if (!OFSSeat.invited(state, email)) {
        title.textContent = "Inbox is not invited.";
        msg.textContent = email + " must be on Whitelist first.";
        return;
      }
      state.members[email] = {
        ...(state.members[email] || {}),
        email,
        provider: "google-oauth2",
        googleSub: info.sub || "",
        verified: false,
      };
      state.session = email;
      OFSSeat.save(state);
      if (!googleVerified) {
        title.textContent = "Google did not mark this inbox verified.";
        msg.textContent = "Sending our verify link.";
        const issued = await OFSSeat.issueVerify(state, email, true);
        if (issued.ok) {
          const link = OFSSeat.verifyUrl(email, issued.raw);
          if (window.OFSMail && OFSMail.deliverVerify) await OFSMail.deliverVerify(email, link);
          location.href = link;
        }
        return;
      }
      const issued = await OFSSeat.issueVerify(OFSSeat.load(), email, true);
      if (!issued.ok) { title.textContent = issued.error; return; }
      const link = OFSSeat.verifyUrl(email, issued.raw);
      if (window.OFSMail && OFSMail.deliverVerify) await OFSMail.deliverVerify(email, link);
      title.textContent = "OAuth2 confirmed " + email + ".";
      msg.textContent = "Finish the one-time OFS verify next. Google is not enough alone.";
      location.href = link;
    })();
