import { login, signup, logout, getUser, getSettings, handleAuthCallback, requestPasswordRecovery, oauthLogin, updateUser, acceptInvite, AuthError, MissingIdentityError } from "https://esm.sh/@netlify/identity@1.2.0";
    const S = OFSSeat;
    const $ = (id) => document.getElementById(id);
    let identityUser = null;
    let identityComplimentary = false;
    let identityOperator = false;
    let recoveryMode = false;
    let inviteToken = "";

    function authMessage(error) {
      const detail = String(error && error.message || "").toLowerCase();
      if (error instanceof MissingIdentityError) return "Email authentication is temporarily unavailable. Please try again shortly.";
      // In the browser, Identity errors arrive without an HTTP status, so match on the message too.
      if (detail.includes("not confirmed")) return "Confirm this email from the message in your inbox, then sign in.";
      if (detail.includes("already been registered")) return "An account already exists for this email. Sign in, or use Forgot password to reset it.";
      if (detail.includes("invalid_grant") || detail.includes("no user found")) return "That email and password do not match. Create the account first if this is your first visit.";
      if (detail === "user not found") return "That email link has expired or was already used. Sign in, or request a new link.";
      if (error instanceof AuthError && error.status === 401 && detail.includes("confirm")) return "Confirm this email from the message in your inbox, then sign in.";
      if (error instanceof AuthError && error.status === 401) return "That email and password do not match. Create the account first if this is your first visit.";
      if (error instanceof AuthError && error.status === 403) return "Sign-in is unavailable for this account. Please try again or reset the password.";
      return error && error.message ? error.message : "Authentication failed. Please try again.";
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
      if (event.key !== "Escape") return;
      if (!$("nav-menu").hidden) {
        closeNav();
        $("nav-trigger").focus();
        return;
      }
      const open = !$("panel-signin").hidden ? "tab-signin" : !$("panel-notifications").hidden ? "tab-notifications" : "";
      if (open) {
        closePanels();
        $(open).focus();
      }
    });

    document.addEventListener("mousedown", (event) => {
      if (!event.target.closest(".page-nav")) closeNav();
    });

    const aiHistory = [];
    const aiThread = $("ai-thread");
    const aiForm = $("ai-form");
    const aiPrompt = $("ai-prompt");
    const aiSend = $("ai-send");
    const aiAction = $("ai-action");
    const aiFiles = $("ai-files");
    const aiFileInput = $("ai-file-input");
    let aiPending = [];
    function addAiMessage(text, kind) {
      const message = document.createElement("p");
      message.className = "ai-message " + kind;
      message.textContent = text;
      aiThread.appendChild(message);
      aiThread.scrollTop = aiThread.scrollHeight;
      return message;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    }

    function syncSend() {
      aiSend.disabled = aiPending.some((item) => item.state === "uploading") || aiSend.dataset.busy === "1";
    }

    function renderAiFiles() {
      aiFiles.replaceChildren(...aiPending.map((item) => {
        const chip = document.createElement("span");
        chip.className = "ai-file" + (item.state === "error" ? " error" : "");
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = item.file.name;
        const size = document.createElement("span");
        size.className = "size";
        size.textContent = item.state === "uploading" ? Math.round(item.progress * 100) + "%" : item.state === "error" ? item.error : formatBytes(item.file.size);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", "Remove " + item.file.name);
        remove.addEventListener("click", () => removeAiFile(item));
        chip.append(name, size, remove);
        if (item.state === "uploading") {
          const bar = document.createElement("span");
          bar.className = "bar";
          bar.style.width = Math.round(item.progress * 100) + "%";
          chip.appendChild(bar);
        }
        return chip;
      }));
      syncSend();
    }

    function removeAiFile(item) {
      item.cancelled = true;
      aiPending = aiPending.filter((entry) => entry !== item);
      if (item.id) fetch("/api/ofs-uploads?id=" + encodeURIComponent(item.id), { method:"DELETE" }).catch(() => {});
      renderAiFiles();
    }

    async function uploadAiFile(item) {
      try {
        const start = await fetch("/api/ofs-uploads", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({ name:item.file.name, type:item.file.type, size:item.file.size }),
        });
        const info = await start.json();
        if (!start.ok) throw new Error(info.error || "Upload failed");
        item.id = info.id;
        for (let part = 0; part < info.parts; part++) {
          if (item.cancelled) return;
          const chunk = item.file.slice(part * info.chunkBytes, (part + 1) * info.chunkBytes);
          let response;
          for (let attempt = 0; attempt < 3; attempt++) {
            response = await fetch("/api/ofs-uploads?id=" + encodeURIComponent(info.id) + "&part=" + part, {
              method:"PUT",
              headers:{ "Content-Type":"application/octet-stream" },
              body:chunk,
            }).catch(() => null);
            if (response && (response.ok || response.status < 500)) break;
          }
          if (!response || !response.ok) {
            const data = response ? await response.json().catch(() => ({})) : {};
            throw new Error(data.error || "Upload failed");
          }
          item.progress = (part + 1) / info.parts;
          renderAiFiles();
        }
        item.state = "ready";
      } catch (error) {
        item.state = "error";
        item.error = error.message || "Upload failed";
      }
      renderAiFiles();
    }

    function addAiFiles(fileList) {
      const files = Array.from(fileList || []).filter((file) => file.size > 0);
      const room = 10 - aiPending.length;
      if (files.length > room) addAiMessage("You can attach up to 10 files per message.", "bot error");
      files.slice(0, Math.max(0, room)).forEach((file) => {
        const item = { file, state:"uploading", progress:0, id:"" };
        aiPending.push(item);
        uploadAiFile(item);
      });
      renderAiFiles();
    }

    $("ai-attach").addEventListener("click", () => aiFileInput.click());
    aiFileInput.addEventListener("change", () => {
      addAiFiles(aiFileInput.files);
      aiFileInput.value = "";
    });
    aiForm.addEventListener("dragover", (event) => {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
      aiForm.classList.add("dragging");
    });
    aiForm.addEventListener("dragleave", () => aiForm.classList.remove("dragging"));
    aiForm.addEventListener("drop", (event) => {
      if (!event.dataTransfer || !event.dataTransfer.files.length) return;
      event.preventDefault();
      aiForm.classList.remove("dragging");
      addAiFiles(event.dataTransfer.files);
    });
    aiPrompt.addEventListener("paste", (event) => {
      if (event.clipboardData && event.clipboardData.files.length) {
        event.preventDefault();
        addAiFiles(event.clipboardData.files);
      }
    });

    // Grow the box with its text so long requests never hide below the fold.
    function fitPrompt() {
      aiPrompt.style.height = "auto";
      aiPrompt.style.height = aiPrompt.scrollHeight + "px";
    }
    aiPrompt.addEventListener("input", fitPrompt);

    // Voice input: live dictation where the browser supports it, otherwise a recorded voice note
    // attached like any other audio file so the assistant can listen to it.
    const aiMic = $("ai-mic");
    const aiVoice = $("ai-voice");
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    let recognition = null;
    let recorder = null;
    let voiceTimer = 0;

    function setListening(on, note) {
      aiMic.setAttribute("aria-pressed", on ? "true" : "false");
      aiMic.setAttribute("aria-label", on ? "Stop listening" : "Speak your request");
      aiVoice.textContent = note || "";
    }

    function voiceError(code) {
      if (code === "not-allowed" || code === "service-not-allowed" || code === "NotAllowedError") return "Microphone access is blocked. Allow it in your browser settings to speak.";
      if (code === "no-speech") return "I didn't catch anything. Tap the mic and try again.";
      if (code === "audio-capture" || code === "NotFoundError") return "No microphone was found.";
      return "Voice input stopped. Try again or type your request.";
    }

    function startDictation() {
      const base = aiPrompt.value.trim();
      let finalText = "";
      let failed = "";
      recognition = new Recognition();
      recognition.lang = document.documentElement.lang || navigator.language || "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += text;
          else interim += text;
        }
        aiPrompt.value = [base, (finalText + interim).trim()].filter(Boolean).join(" ").slice(0, 6000);
        fitPrompt();
        aiPrompt.scrollTop = aiPrompt.scrollHeight;
      };
      recognition.onerror = (event) => { if (event.error !== "aborted") failed = voiceError(event.error); };
      recognition.onend = () => {
        recognition = null;
        setListening(false, failed);
        if (!failed) aiPrompt.focus();
      };
      recognition.start();
      setListening(true, "Listening… tap the mic again when you're done.");
    }

    async function startRecording() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      } catch (error) {
        setListening(false, voiceError(error && error.name));
        return;
      }
      const type = ["audio/ogg;codecs=opus", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const chunks = [];
      recorder = new MediaRecorder(stream, type ? { mimeType:type } : undefined);
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearInterval(voiceTimer);
        stream.getTracks().forEach((track) => track.stop());
        const mime = (recorder.mimeType || type || "audio/webm").split(";")[0];
        const ext = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
        recorder = null;
        setListening(false, chunks.length ? "Voice note attached. Add a note or press send." : voiceError("no-speech"));
        if (!chunks.length) return;
        const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "-");
        addAiFiles([new File(chunks, "voice-note-" + stamp + "." + ext, { type:mime })]);
        aiPrompt.focus();
      };
      recorder.start();
      const startedAt = Date.now();
      const show = () => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setListening(true, "Recording " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " — tap the mic again to attach it.");
        if (s >= 120 && recorder) recorder.stop();
      };
      show();
      voiceTimer = setInterval(show, 500);
    }

    function stopVoice() {
      if (recognition) recognition.stop();
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }

    if (Recognition || canRecord) {
      aiMic.hidden = false;
      if (!Recognition) aiMic.title = "Record a voice note";
      aiMic.addEventListener("click", () => {
        if (recognition || recorder) return stopVoice();
        try {
          if (Recognition) startDictation();
          else startRecording();
        } catch (error) {
          recognition = null;
          setListening(false, voiceError(error && error.name));
        }
      });
    }

    // Server rejects bodies over 60,000 bytes; drop the oldest turns until well under that.
    const AI_BODY_BYTES = 50000;
    const byteLength = (text) => new TextEncoder().encode(text).length;
    function aiBody() {
      let turns = aiHistory.slice(-8).map((m) => ({ role:m.role, content:m.content.slice(0, 6000), attachments:m.attachments || [] }));
      let body = JSON.stringify({ messages:turns });
      while (turns.length > 1 && byteLength(body) > AI_BODY_BYTES) {
        turns = turns.slice(1);
        // The server expects the thread to read from a user turn.
        while (turns.length > 1 && turns[0].role !== "user") turns = turns.slice(1);
        body = JSON.stringify({ messages:turns });
      }
      return body;
    }

    async function askOFS(prompt) {
      const ready = aiPending.filter((item) => item.state === "ready");
      const clean = String(prompt || "").trim() || (ready.length ? "Please review the attached file" + (ready.length > 1 ? "s" : "") + " and tell me how they can help build my business." : "");
      if (!clean || aiSend.disabled) return;
      const userMessage = addAiMessage(clean, "user");
      if (ready.length) {
        const attached = document.createElement("span");
        attached.className = "ai-attached";
        attached.textContent = "📎 " + ready.map((item) => item.file.name).join(", ");
        userMessage.appendChild(attached);
      }
      const userTurn = { role:"user", content:clean, attachments:ready.map((item) => item.id) };
      aiHistory.push(userTurn);
      aiPending = aiPending.filter((item) => item.state !== "ready");
      renderAiFiles();
      aiPrompt.value = "";
      fitPrompt();
      aiAction.hidden = true;
      aiSend.dataset.busy = "1";
      syncSend();
      const thinking = addAiMessage("", "bot thinking");
      const bulb = document.createElement("span");
      bulb.className = "ai-bulb";
      bulb.setAttribute("aria-hidden", "true");
      bulb.textContent = "💡";
      const label = document.createElement("span");
      label.textContent = " Thinking… ";
      const timer = document.createElement("span");
      timer.className = "ai-timer";
      timer.textContent = "🤔 0.0s";
      thinking.append(bulb, label, timer);
      const startedAt = performance.now();
      const elapsed = () => ((performance.now() - startedAt) / 1000).toFixed(1) + "s";
      const tick = setInterval(() => { timer.textContent = "🤔 " + elapsed(); }, 100);
      try {
        const response = await fetch("/api/ofs-assistant", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:aiBody(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.reply !== "string") {
          throw new Error(data.error || (response.status === 413 ? "That conversation is too long. Refresh to start a new one." : "The build desk is unavailable. Try again."));
        }
        clearInterval(tick);
        thinking.remove();
        addAiMessage("💡 Thought for " + elapsed(), "bot meta");
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
        clearInterval(tick);
        thinking.remove();
        // Drop the failed turn so a retry does not stack two user turns in a row.
        const at = aiHistory.lastIndexOf(userTurn);
        if (at !== -1) aiHistory.splice(at, 1);
        addAiMessage(error.message || "The build desk is unavailable. Try again.", "bot error");
      } finally {
        aiSend.dataset.busy = "";
        syncSend();
        aiPrompt.focus();
      }
    }

    aiForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (recognition) recognition.abort();
      askOFS(aiPrompt.value);
    });
    aiPrompt.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
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
      $("panel-signin").hidden = true;
      $("panel-notifications").hidden = true;
      $("tab-signin").setAttribute("aria-expanded", "false");
      $("tab-notifications").setAttribute("aria-expanded", "false");
    }

    function openPanel(which) {
      const sign = which === "signin";
      const notifications = which === "notifications";
      $("panel-signin").hidden = !sign;
      $("panel-notifications").hidden = !notifications;
      $("tab-signin").setAttribute("aria-expanded", String(sign));
      $("tab-notifications").setAttribute("aria-expanded", String(notifications));
    }

    function paint() {
      if (window.OFSHost && OFSHost.seed) OFSHost.seed();
      const session = identityUser && S.norm(identityUser.email);
      $("tab-notifications").classList.toggle("hidden", !session);
      $("signed-out").classList.toggle("hidden", Boolean(session));
      $("signed-in").classList.add("hidden");
      if (session) {
        // Keep the local seat aligned with the signed-in account so receipts sync to it.
        const seat = S.load();
        if (seat.session !== session) { seat.session = session; S.save(seat); }
      }

      if (session && identityOperator) {
        $("tab-signin").textContent = "Profile";
        $("who").textContent = "Signed in as Creator · complimentary seat";
        $("seat-note").textContent = identityUser.confirmedAt ? "Inbox verified." : "";
        $("signed-in").classList.remove("hidden");
        $("signed-out").classList.add("hidden");
        $("form-whitelist").classList.remove("hidden");
        paintBuys();
        paintWhitelist();
        return;
      }

      // Only the operator sees the whitelist manager; the API refuses everyone else too.
      $("form-whitelist").classList.add("hidden");
      $("whitelist-list").innerHTML = "";

      if (session) {
        $("tab-signin").textContent = "Profile";
        $("who").textContent = "Signed in as " + publicName(session);
        $("seat-note").textContent = identityUser.confirmedAt ? "Inbox verified." : "";
        $("signed-in").classList.remove("hidden");
        $("signed-out").classList.add("hidden");
        paintBuys();
        return;
      }

      $("tab-signin").textContent = "Sign in";
    }

    function vaultRows(rows) {
      return rows.length
        ? rows.map((r) => "<li><span>" + escapeHtml(r.label) + "<br><span class='mono'>" + escapeHtml(r.fqdn || "") + "</span></span><span>" + escapeHtml(r.pay) + "</span></li>").join("")
        : "<li>Vault is empty.</li>";
    }

    // Prefer server purchase records; fall back to this browser's receipts for this account only (never "guest" rows).
    let buysRun = 0;
    async function paintBuys() {
      const ul = $("buy-list");
      if (!ul) return;
      const run = ++buysRun;
      const session = identityUser && S.norm(identityUser.email);
      const local = window.OFSPurchases && session
        ? OFSPurchases.load().filter((r) => r.email === session).map((r) => ({
            label:r.label, fqdn:r.fqdn, pay:r.complimentary || r.due === 0 ? "free" : "$" + Number(r.due).toFixed(2),
          }))
        : [];
      ul.innerHTML = vaultRows(local);
      if (!session) return;
      try {
        const response = await fetch("/api/purchases", { headers:{ Accept:"application/json" } });
        if (!response.ok) return;
        const result = await response.json().catch(() => ({}));
        if (run !== buysRun || !Array.isArray(result.purchases)) return;
        ul.innerHTML = vaultRows(result.purchases.map((r) => ({
          label:r.label || r.plan || "Purchase",
          fqdn:r.fqdn,
          pay:r.complimentary || !Number(r.amount_cents) ? "free" : "$" + (Number(r.amount_cents) / 100).toFixed(2),
        })));
      } catch (_) {}
    }
    if (S.onSync) S.onSync(() => { paintBuys(); });

    $("tab-signin").addEventListener("click", () => {
      if (!$("panel-signin").hidden) closePanels();
      else openPanel("signin");
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

    async function paintWhitelist() {
      const list = $("whitelist-list");
      $("whitelist-err").textContent = "";
      try {
        const response = await fetch("/api/whitelist", { headers:{ Accept:"application/json" } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Whitelist is unavailable.");
        const rows = result.whitelist || [];
        list.innerHTML = rows.map((row) => {
          const email = escapeHtml(row.email).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
          const since = new Date(row.active ? row.last_added_at : row.removed_at).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
          const note = row.operator ? "Creator · always free" : row.active ? "Free since " + since : "Removed " + since;
          const action = row.operator ? ""
            : row.active ? "<button class='btn ghost' type='button' data-wl-remove='" + email + "'>Remove</button>"
            : "<button class='btn ghost' type='button' data-wl-add='" + email + "'>Restore</button>";
          return "<li" + (row.active ? "" : " class='wl-off'") + "><span class='wl-email'>" + email + "<br><span class='k'>" + note + "</span></span>" + action + "</li>";
        }).join("") || "<li class='lead'>No whitelisted emails yet.</li>";
      } catch (error) {
        $("whitelist-err").textContent = error.message;
      }
    }

    async function changeWhitelist(method, email) {
      $("whitelist-err").textContent = "";
      const response = await fetch(method === "DELETE" ? "/api/whitelist?email=" + encodeURIComponent(email) : "/api/whitelist", {
        method,
        headers:{ "content-type":"application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ email }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Whitelist could not be updated.");
      }
      await paintWhitelist();
    }

    $("form-whitelist").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = $("whitelist-email");
      const email = S.norm(input.value);
      if (!S.valid(email)) { $("whitelist-err").textContent = "Enter a valid email."; return; }
      const add = event.currentTarget.querySelector("button[type=submit]");
      add.disabled = true;
      try {
        await changeWhitelist("POST", email);
        input.value = "";
      } catch (error) {
        $("whitelist-err").textContent = error.message;
      } finally { add.disabled = false; }
    });

    $("whitelist-list").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-wl-remove], button[data-wl-add]");
      if (!button) return;
      const removing = button.hasAttribute("data-wl-remove");
      const email = removing ? button.dataset.wlRemove : button.dataset.wlAdd;
      if (removing && !confirm("Remove " + email + " from the whitelist? They will pay for new purchases.")) return;
      button.disabled = true;
      try { await changeWhitelist(removing ? "DELETE" : "POST", email); }
      catch (error) { $("whitelist-err").textContent = error.message; button.disabled = false; }
    });

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
      const form = event.currentTarget;
      const send = form.querySelector("button[type=submit]");
      $("notice-err").textContent = "";
      send.disabled = true;
      try {
        const response = await fetch("/api/notifications", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body:JSON.stringify({ title:$("broadcast-title").value, message:$("broadcast-message").value }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Update could not be sent.");
        form.reset();
      } catch (error) {
        $("notice-err").textContent = error.message || "Update could not be sent.";
        return;
      } finally { send.disabled = false; }
      // Refresh separately so a slow list never reads as a failed send.
      paintNotifications();
    });

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
        const next = returnTo();
        if (next) {
          try { sessionStorage.removeItem("ofs.domains.next"); } catch (_) {}
          location.href = next;
          return;
        }
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

    // Pages like Sauce send visitors here with ?signin=1&next=sauce.html and get them back after sign-in.
    function returnTo() {
      let next = new URLSearchParams(location.search).get("next") || "";
      // Google sign-in drops the query string on its way back, so remember the destination.
      try {
        if (next) sessionStorage.setItem("ofs.domains.next", next);
        else next = sessionStorage.getItem("ofs.domains.next") || "";
      } catch (_) {}
      return /^[a-z0-9-]+\.html$/.test(next) ? next : "";
    }

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
    const cameBack = authCallback && (authCallback.type === "oauth" || authCallback.type === "confirmation");
    if (identityUser && (queryParams.get("next") || cameBack) && returnTo()) {
      const next = returnTo();
      try { sessionStorage.removeItem("ofs.domains.next"); } catch (_) {}
      location.replace(next);
    }
    if (queryParams.get("signin") === "1" && !identityUser) openPanel("signin");
    if (location.hash) {
      const query = queryParams.toString();
      history.replaceState({}, "", location.pathname + (query ? "?" + query : ""));
    }
