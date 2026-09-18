import { login, signup, logout, getUser, getSettings, handleAuthCallback, requestPasswordRecovery, oauthLogin, updateUser, acceptInvite, AuthError, MissingIdentityError } from "https://esm.sh/@netlify/identity@1.2.0";
    const S = OFSSeat;
    const $ = (id) => document.getElementById(id);
    let identityUser = null;
    let identityComplimentary = false;
    let identityOperator = false;
    let remoteWhitelist = [];
    let recoveryMode = false;
    let inviteToken = "";

    function authMessage(error) {
      const detail = String(error && error.message || "").toLowerCase();
      if (error instanceof MissingIdentityError) return "Email authentication is temporarily unavailable. Please try again shortly.";
      if (error instanceof AuthError && error.status === 401 && detail.includes("confirm")) return "Confirm this email from the message in your inbox, then sign in.";
      if (error instanceof AuthError && error.status === 401) return "That email and password do not match. Create the account first if this is your first visit.";
      if (error instanceof AuthError && error.status === 403) return "Sign-in is unavailable for this account. Please try again or reset the password.";
      return error && error.message ? error.message : "Authentication failed. Please try again.";
    }

    async function whitelistRequest(options) {
      const response = await fetch("/api/whitelist" + (options && options.query || ""), {
        method: options && options.method || "GET",
        headers: options && options.body ? { "content-type": "application/json" } : undefined,
        body: options && options.body ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Whitelist request failed.");
      }
      return response.status === 204 ? null : response.json();
    }

    async function refreshEntitlement() {
      identityComplimentary = false;
      identityOperator = false;
      if (!identityUser) return;
      try {
        const response = await fetch("/api/entitlement", { headers: { Accept:"application/json" } });
        const result = response.ok ? await response.json() : {};
        identityComplimentary = Boolean(result.complimentary);
        identityOperator = Boolean(result.canManage);
      } catch (_) {}
    }

    function closeNav() {
      $("nav-menu").hidden = true;
      $("nav-trigger").setAttribute("aria-expanded", "false");
    }

    $("nav-trigger").addEventListener("click", () => {
      const opening = $("nav-menu").hidden;
      $("nav-menu").hidden = !opening;
      $("nav-trigger").setAttribute("aria-expanded", String(opening));
      if (opening) $("nav-menu").querySelector("a").focus();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("nav-menu").hidden) {
        closeNav();
        $("nav-trigger").focus();
      }
    });

    document.addEventListener("mousedown", (event) => {
      if (!event.target.closest(".page-nav")) closeNav();
    });

    const aiHistory = [];
    const intro = $("home-intro");
    const aiDesk = document.querySelector(".ai-desk");
    const aiThread = $("ai-thread");
    const aiForm = $("ai-form");
    const aiPrompt = $("ai-prompt");
    const aiSend = $("ai-send");
    const aiAction = $("ai-action");
    let workspaceTimer;

    function accountPanelOpen() {
      return !$("panel-signin").hidden || !$("panel-whitelist").hidden || !$("panel-notifications").hidden;
    }

    function showWorkspace() {
      if (accountPanelOpen()) return;
      intro.classList.remove("resting-away");
      aiDesk.classList.remove("resting-away");
      aiDesk.inert = false;
      aiDesk.removeAttribute("aria-hidden");
    }

    function pauseWorkspace(event) {
      if (event && event.target instanceof Element && event.target.closest(".ai-desk")) return;
      intro.classList.add("resting-away");
      aiDesk.classList.add("resting-away");
      aiDesk.inert = true;
      aiDesk.setAttribute("aria-hidden", "true");
      clearTimeout(workspaceTimer);
      workspaceTimer = setTimeout(showWorkspace, 1000);
    }

    ["scroll", "pointerdown", "keydown"].forEach((name) => {
      window.addEventListener(name, pauseWorkspace, { passive:true });
    });

    function addAiMessage(text, kind) {
      const message = document.createElement("p");
      message.className = "ai-message " + kind;
      message.textContent = text;
      aiThread.appendChild(message);
      aiThread.scrollTop = aiThread.scrollHeight;
      return message;
    }

    async function askOFS(prompt) {
      const clean = String(prompt || "").trim();
      if (!clean || aiSend.disabled) return;
      addAiMessage(clean, "user");
      aiHistory.push({ role:"user", content:clean });
      aiPrompt.value = "";
      aiAction.hidden = true;
      aiSend.disabled = true;
      const thinking = addAiMessage("Charting the quickest route…", "bot thinking");
      try {
        const response = await fetch("/api/ofs-assistant", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ messages:aiHistory.slice(-8) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The build desk is unavailable.");
        thinking.remove();
        addAiMessage(data.reply, "bot");
        aiHistory.push({ role:"assistant", content:data.reply });
        if (data.action && data.action.href) {
          const allowed = ["auto.html", "name.html", "drop.html", "host.html", "live.html"];
          if (allowed.includes(data.action.href)) {
            aiAction.href = data.action.href;
            aiAction.textContent = data.action.label || "Open workflow";
            aiAction.hidden = false;
            aiAction.onclick = () => sessionStorage.setItem("ofs.domains.ai-brief", data.action.brief || clean);
          }
        }
      } catch (error) {
        thinking.remove();
        addAiMessage(error.message || "The build desk is unavailable. Try again.", "bot error");
      } finally {
        aiSend.disabled = false;
        aiPrompt.focus();
      }
    }

    aiForm.addEventListener("submit", (event) => {
      event.preventDefault();
      askOFS(aiPrompt.value);
    });
    aiPrompt.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        aiForm.requestSubmit();
      }
    });
    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => askOFS(button.dataset.prompt));
    });

    function publicName(email) {
      if (identityOperator) return "Creator";
      return email;
    }

    function closePanels() {
      const wasOpen = accountPanelOpen();
      $("panel-signin").hidden = true;
      $("panel-whitelist").hidden = true;
      $("panel-notifications").hidden = true;
      $("tab-signin").setAttribute("aria-expanded", "false");
      $("tab-whitelist").setAttribute("aria-expanded", "false");
      $("tab-notifications").setAttribute("aria-expanded", "false");
      if (wasOpen) pauseWorkspace();
    }

    function openPanel(which) {
      pauseWorkspace();
      const sign = which === "signin";
      const whitelist = which === "whitelist";
      const notifications = which === "notifications";
      $("panel-signin").hidden = !sign;
      $("panel-whitelist").hidden = !whitelist;
      $("panel-notifications").hidden = !notifications;
      $("tab-signin").setAttribute("aria-expanded", String(sign));
      $("tab-whitelist").setAttribute("aria-expanded", String(whitelist));
      $("tab-notifications").setAttribute("aria-expanded", String(notifications));
    }

    async function paintInvites() {
      const ul = $("invite-list");
      ul.innerHTML = "";
      const allowed = Boolean(identityUser && identityOperator);
      $("form-invite").classList.toggle("hidden", !allowed);
      $("whitelist-access").classList.toggle("hidden", allowed);
      if (!allowed) {
        ul.innerHTML = "<li class='lead' style='display:block'>Whitelist management is available after operator sign-in.</li>";
        return;
      }
      try {
        const result = await whitelistRequest();
        remoteWhitelist = result.whitelist.map((row) => row.email);
      } catch (error) {
        $("invite-err").textContent = error.message;
        return;
      }
      if (!remoteWhitelist.length) {
        ul.innerHTML = "<li class='lead' style='display:block'>No invites yet.</li>";
        return;
      }
      remoteWhitelist.forEach((email) => {
        const status = "Allowed";
        const li = document.createElement("li");
        li.innerHTML = "<span class='mono'>" + email + "<br><span class='k'>" + status + "</span></span>";
        const actions = document.createElement("span");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Remove";
        btn.disabled = S.isCreator(email);
        btn.addEventListener("click", async () => {
          try {
            await whitelistRequest({ method: "DELETE", query: "?email=" + encodeURIComponent(email) });
            await paintInvites();
          } catch (error) { $("invite-err").textContent = error.message; }
        });
        actions.appendChild(btn);
        li.appendChild(actions);
        ul.appendChild(li);
      });
    }

    function paint() {
      if (window.OFSHost && OFSHost.seed) OFSHost.seed();
      const session = identityUser && S.norm(identityUser.email);
      $("tab-notifications").classList.toggle("hidden", !session);
      $("signed-out").classList.toggle("hidden", Boolean(session));
      $("signed-in").classList.add("hidden");

      if (session && identityOperator) {
        $("tab-signin").textContent = "Profile";
        $("who").textContent = "Signed in as Creator · complimentary seat";
        $("seat-note").textContent = "Inbox verified. Invite on Whitelist. They still verify too.";
        $("signed-in").classList.remove("hidden");
        $("signed-out").classList.add("hidden");
        paintInvites();
        paintBuys();
        return;
      }

      if (session) {
        $("tab-signin").textContent = "Profile";
        $("who").textContent = "Signed in as " + publicName(session);
        $("seat-note").textContent = identityComplimentary
          ? "Verified invite. This year is free on this vault."
          : "Public account. Paid year still applies.";
        $("signed-in").classList.remove("hidden");
        $("signed-out").classList.add("hidden");
        paintBuys();
        return;
      }

      $("tab-signin").textContent = "Sign in";
    }

    function paintBuys() {
      const ul = $("buy-list");
      if (!ul) return;
      const rows = window.OFSPurchases ? OFSPurchases.forAccount() : [];
      ul.innerHTML = rows.length
        ? rows.map((r) => {
            const pay = r.complimentary || r.due === 0 ? "free" : "$" + Number(r.due).toFixed(2);
            return "<li><span>" + escapeHtml(r.label) + "<br><span class='mono'>" + escapeHtml(r.fqdn || "") + "</span></span><span>" + escapeHtml(pay) + "</span></li>";
          }).join("")
        : "<li>Vault is empty.</li>";
      const white = $("profile-white");
      if (!white) return;
      const state = S.load();
      const invited = (state.whitelist || []).slice();
      if (!invited.includes(S.CREATOR)) invited.unshift(S.CREATOR);
      white.innerHTML = invited.map((email) => {
        const m = state.members[email];
        const status = m && m.verified ? "verified" : "invited";
        return "<li><span class='mono'>" + escapeHtml(email) + "</span><span class='k'>" + escapeHtml(status) + "</span></li>";
      }).join("");
    }
    if (S.onSync) S.onSync(() => { paintBuys(); });

    $("tab-signin").addEventListener("click", () => {
      if (!$("panel-signin").hidden) closePanels();
      else openPanel("signin");
    });
    $("tab-whitelist").addEventListener("click", () => {
      if (!$("panel-whitelist").hidden) closePanels();
      else {
        openPanel("whitelist");
        paintInvites();
      }
    });
    $("tab-notifications").addEventListener("click", () => {
      if (!$("panel-notifications").hidden) closePanels();
      else {
        openPanel("notifications");
        paintNotifications();
      }
    });

    function escapeHtml(value) {
      const span = document.createElement("span");
      span.textContent = String(value || "");
      return span.innerHTML;
    }

    async function paintNotifications() {
      const list = $("notice-list");
      $("notice-err").textContent = "";
      list.innerHTML = "<li class='lead'>Loading notifications…</li>";
      try {
        const response = await fetch("/api/notifications");
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Notifications are unavailable.");
        $("form-broadcast").classList.toggle("hidden", !result.canBroadcast);
        const reminders = (result.renewals || []).map((row) => {
          const when = new Date(row.renews_at).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
          const amount = row.complimentary ? "Complimentary" : "$" + (Number(row.amount_cents) / 100).toFixed(2);
          return "<li><span><strong>Renewal reminder</strong><br>" + escapeHtml(row.label) + " · " + escapeHtml(row.fqdn || "Account service") + "</span><span class='k'>" + amount + " · " + when + "</span></li>";
        });
        const updates = (result.updates || []).map((row) => {
          const when = new Date(row.created_at).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
          return "<li style='display:block'><strong>" + escapeHtml(row.title) + "</strong><br><span class='lead'>" + escapeHtml(row.message) + "</span><br><span class='k'>" + when + "</span></li>";
        });
        list.innerHTML = reminders.concat(updates).join("") || "<li class='lead'>You’re all caught up.</li>";
      } catch (error) {
        list.innerHTML = "";
        $("notice-err").textContent = error.message;
      }
    }

    $("form-broadcast").addEventListener("submit", async (event) => {
      event.preventDefault();
      $("notice-err").textContent = "";
      try {
        const response = await fetch("/api/notifications", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify({ title:$("broadcast-title").value, message:$("broadcast-message").value }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Update could not be sent.");
        event.currentTarget.reset();
        await paintNotifications();
      } catch (error) { $("notice-err").textContent = error.message; }
    });

    function canInvite() {
      return Boolean(identityUser && identityOperator);
    }

    document.addEventListener("mousedown", (e) => {
      if (!$("account").contains(e.target)) closePanels();
    });

    $("form-register").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("auth-err").textContent = "";
      $("auth-ok").textContent = "";
      const email = S.norm($("email").value);
      const emailConfirm = S.norm($("email-confirm").value);
      const password = $("password").value;
      if (password.length < 8) { $("auth-err").textContent = "Password needs 8 characters."; return; }
      try {
        if (inviteToken) {
          identityUser = await acceptInvite(inviteToken, password);
          inviteToken = "";
          $("email").readOnly = false;
          $("do-register").textContent = "Create account";
          $("auth-ok").textContent = "Password created. You are signed in.";
          await refreshEntitlement();
          paint();
          openPanel("signin");
          return;
        }
        if (!S.valid(email)) { $("auth-err").textContent = "Enter a valid email."; return; }
        if (recoveryMode) {
          identityUser = await updateUser({ password });
          recoveryMode = false;
          $("email").readOnly = false;
          $("do-register").textContent = "Create account";
          $("auth-ok").textContent = "Password updated. You are signed in.";
          await refreshEntitlement();
          paint();
          openPanel("signin");
          return;
        }
        if (!emailConfirm) { $("auth-err").textContent = "Confirm your email to create an account."; return; }
        if (email !== emailConfirm) { $("auth-err").textContent = "Email addresses do not match."; return; }
        const user = await signup(email, password);
        if (user.confirmedAt) {
          identityUser = user;
          await refreshEntitlement();
          paint();
        } else {
          $("auth-ok").textContent = "Check your email to confirm your account, then sign in.";
        }
      } catch (error) {
        $("auth-err").textContent = authMessage(error);
        openPanel("signin");
      }
    });

    $("toggle-password").addEventListener("click", () => {
      const password = $("password");
      const reveal = password.type === "password";
      password.type = reveal ? "text" : "password";
      $("toggle-password").textContent = reveal ? "Hide password" : "Show password";
      $("toggle-password").setAttribute("aria-pressed", String(reveal));
    });

    $("do-google").addEventListener("click", () => {
      if ($("do-google").hidden) return;
      $("auth-err").textContent = "";
      $("auth-ok").textContent = "";
      $("do-google").disabled = true;
      $("do-google").textContent = "Opening Google…";
      try {
        oauthLogin("google");
      } catch (error) {
        // oauthLogin redirects by assigning location, then intentionally throws.
        // Only surface genuine failures if the browser remains on this page.
        if (!error || error.message !== "Redirecting to OAuth provider") {
          $("do-google").disabled = false;
          $("do-google").textContent = "Continue with Google";
          $("auth-err").textContent = authMessage(error);
          openPanel("signin");
        }
      }
    });

    $("do-forgot").addEventListener("click", async () => {
      $("auth-err").textContent = "";
      $("auth-ok").textContent = "";
      const email = S.norm($("email").value);
      if (!S.valid(email)) { $("auth-err").textContent = "Enter the inbox first."; return; }
      try {
        await requestPasswordRecovery(email);
        $("auth-ok").textContent = "Check your email for a password reset link.";
      } catch (error) { $("auth-err").textContent = authMessage(error); }
    });

    $("do-login").addEventListener("click", async () => {
      $("auth-err").textContent = "";
      $("auth-ok").textContent = "";
      const email = S.norm($("email").value);
      const password = $("password").value;
      if (!S.valid(email) || !password) {
        $("auth-err").textContent = "Enter your email and password.";
        openPanel("signin");
        return;
      }
      try {
        $("do-login").disabled = true;
        $("do-login").textContent = "Signing in…";
        identityUser = await login(email, password);
        await refreshEntitlement();
        paint();
        openPanel("signin");
      } catch (error) {
        identityUser = null;
        $("auth-err").textContent = authMessage(error);
        openPanel("signin");
      } finally {
        $("do-login").disabled = false;
        $("do-login").textContent = "Sign in";
      }
    });

    $("do-out").addEventListener("click", async () => {
      await logout();
      identityUser = null;
      identityComplimentary = false;
      identityOperator = false;
      const state = S.load();
      state.session = null;
      S.save(state);
      paint();
      openPanel("signin");
    });

    $("form-invite").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("invite-err").textContent = "";
      if (!canInvite()) {
        $("invite-err").textContent = "Authorize with the operator inbox first.";
        return;
      }
      const email = S.norm($("invite").value);
      if (!S.valid(email)) { $("invite-err").textContent = "Enter a valid email."; return; }
      try {
        await whitelistRequest({ method: "POST", body: { email } });
        $("invite").value = "";
        $("invite-ok").textContent = "Email added to the whitelist.";
        await paintInvites();
      } catch (error) { $("invite-err").textContent = error.message; }
    });

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
    let authCallback = null;
    const callbackParams = new URLSearchParams(location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(location.search);
    const callbackError = callbackParams.get("error_description") || callbackParams.get("error");
    if (callbackError) {
      $("auth-err").textContent = callbackError === "access_denied"
        ? "Google sign-in was cancelled."
        : "Google sign-in could not be completed. Please try again.";
      openPanel("signin");
    }
    try {
      // This single processor handles confirmation, recovery, invitation,
      // email-change, and OAuth callbacks and establishes the right session.
      authCallback = await handleAuthCallback();
      if (authCallback && authCallback.user) identityUser = authCallback.user;
    } catch (error) {
      $("auth-err").textContent = authMessage(error);
    }
    if (!identityUser) identityUser = await getUser();
    await refreshEntitlement();
    try {
      const settings = await getSettings();
      $("do-google").hidden = !settings.providers.google;
    } catch (error) {
      // Keep unavailable providers out of the live sign-in experience.
      $("do-google").hidden = true;
    }
    paint();
    if (authCallback && authCallback.type === "oauth" && authCallback.user) {
      $("auth-ok").textContent = "Signed in with Google.";
      openPanel("signin");
    }
    if (authCallback && authCallback.type === "confirmation" && authCallback.user) {
      $("auth-ok").textContent = "Email confirmed. You are signed in.";
      openPanel("signin");
    }
    if (authCallback && authCallback.type === "email_change" && authCallback.user) {
      $("auth-ok").textContent = "Email address confirmed and updated.";
      openPanel("signin");
    }
    if (authCallback && authCallback.type === "invite" && authCallback.token) {
      inviteToken = authCallback.token;
      $("signed-in").classList.add("hidden");
      $("signed-out").classList.remove("hidden");
      $("email").value = "";
      $("email").readOnly = true;
      $("password").value = "";
      $("do-register").textContent = "Create password";
      $("auth-ok").textContent = "Create a password to accept your invitation and sign in.";
      openPanel("signin");
    }
    if (authCallback && authCallback.type === "recovery") {
      recoveryMode = true;
      $("signed-in").classList.add("hidden");
      $("signed-out").classList.remove("hidden");
      $("email").value = authCallback.user && authCallback.user.email || "";
      $("email").readOnly = true;
      $("password").value = "";
      $("do-register").textContent = "Save new password";
      $("auth-ok").textContent = "Enter a new password, then save it.";
      openPanel("signin");
    }
    if (location.hash) {
      const query = queryParams.toString();
      history.replaceState({}, "", location.pathname + (query ? "?" + query : ""));
    }
