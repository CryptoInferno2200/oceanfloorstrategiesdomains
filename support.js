/** OFS Domains — error handler + AI customer service. Support inbox is seeded, change later. */
(function () {
  const SUPPORT = "oceanfloorstrategies2200@gmail.com";
  const KEY = "ofs.domains.support.v1";

  const REPLIES = [
    { test: /claim|\$10|ten dollar/i, reply: "Claim is $10 a year for the name. Both listings are $0. Plot and bind stay on. Checkout opens Stripe for Claim." },
    { test: /ofs one|\$99|ninety/i, reply: "OFS One is $99 a year. Tide seat, launch kit, plot, deed, and the name year are in it. Checkout opens the OFS One Stripe link." },
    { test: /abyss/i, reply: "Abyss One is $299 a year for five names and the studio seat. Store, studio, and game stacks are in it. Checkout opens the Abyss One Stripe link." },
    { test: /list|web3|dual|both/i, reply: "Web, Web3, or both is $0 extra. Same letters. Same year." },
    { test: /free|white ?list|complimentary|creator/i, reply: "Creator and verified invited inboxes are complimentary. Everyone else pays the year. Invites still set a password and open the verify link." },
    { test: /stripe|pay|card|checkout/i, reply: "Products → Checkout → Pay. Claim, OFS One, and Abyss One each have their own Stripe link. Complimentary seats skip Stripe and go Live." },
    { test: /verify|password|sign ?in|login/i, reply: "Invited inboxes create a password, then open the one-time link sent to that inbox. The token is hashed, one use, 20 minutes." },
    { test: /error|broke|bug|fail|blank/i, reply: "If a page broke, stay here and tell me what you tapped. I can also open a message to support with the error attached." },
    { test: /host|publish|live|domain/i, reply: "A real ICANN name. Site on HTTPS. Go Live writes the receipt. Bind and Reef are the vault — not required to launch." },
    { test: /encrypt|pgp|tls|privacy|secure mail/i, reply: "Queued tickets are sealed with AES-256-GCM as OFS-MAIL/1. The body hash is SHA-256. Your mail app carries the letter over TLS. Verify links still have to be readable by that inbox." },
  ];

  function answer(text) {
    const q = String(text || "").trim();
    if (!q) return { hit: true, text: "Ask about Claim, OFS One, Abyss One, listings, or checkout." };
    for (const row of REPLIES) if (row.test.test(q)) return { hit: true, text: row.reply };
    return { hit: false, text: "No catalog match. Routing this to the operator seat now." };
  }

  function routeMail(text, extra) {
    const route = (window.OFSMail && OFSMail.classify(text)) || "support";
    const body = extra || ("Page: " + location.href + "\n\n" + text);
    if (window.OFSMail) return OFSMail.send({ route, subject: text.slice(0, 80), body });
    location.href =
      "mailto:" + encodeURIComponent(SUPPORT) +
      "?subject=" + encodeURIComponent("[OFS Support] " + text.slice(0, 80)) +
      "&body=" + encodeURIComponent(body);
    return { route: "support" };
  }

  function logError(kind, message) {
    const rows = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    rows.push({ kind, message: String(message || ""), at: Date.now(), path: location.pathname });
    sessionStorage.setItem(KEY, JSON.stringify(rows.slice(-8)));
    banner(String(message || "Something broke on this page."));
  }

  function banner(text) {
    const el = document.getElementById("ofs-err");
    if (!el) return;
    el.hidden = false;
    el.querySelector("span").textContent = text;
  }

  function bubble(role, text) {
    const log = document.getElementById("ofs-cs-log");
    if (!log) return;
    const p = document.createElement("p");
    p.className = role;
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function mount() {
    if (document.getElementById("ofs-cs")) return;
    const css = document.createElement("style");
    css.textContent = `
      #ofs-err{position:fixed;left:12px;right:12px;top:12px;z-index:40;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;background:#2a1514;color:#f3d7d3;box-shadow:0 0 0 1px rgba(243,215,211,.2);font:13px/1.4 ui-sans-serif,system-ui}
      #ofs-err[hidden]{display:none}
      #ofs-err button{margin-left:auto;border:0;background:transparent;color:#f3d7d3;cursor:pointer;font:inherit}
      #ofs-cs-btn{position:fixed;right:16px;bottom:16px;z-index:30;height:48px;padding:0 16px;border:0;border-radius:999px;background:#eef4f2;color:#041016;font:600 13px ui-sans-serif,system-ui;cursor:pointer}
      #ofs-cs{position:fixed;right:16px;bottom:72px;z-index:30;width:min(22rem,calc(100vw - 2rem));max-height:min(28rem,70vh);display:flex;flex-direction:column;padding:14px;border-radius:16px;background:rgba(8,22,28,.96);color:#eef4f2;box-shadow:0 0 0 1px rgba(238,244,242,.12)}
      #ofs-cs-btn,#ofs-cs{transition:opacity .15s ease}
      body.ofs-cs-scrolling #ofs-cs-btn,body.ofs-cs-scrolling #ofs-cs{opacity:0;pointer-events:none}
      #ofs-cs[hidden]{display:none}
      #ofs-cs .k{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9bb0aa}
      #ofs-cs-log{flex:1;overflow:auto;margin:10px 0;display:grid;gap:8px}
      #ofs-cs-log p{margin:0;padding:8px 10px;border-radius:12px;font-size:13px;line-height:1.4}
      #ofs-cs-log p.bot{background:rgba(238,244,242,.06)}
      #ofs-cs-log p.you{background:#eef4f2;color:#041016}
      #ofs-cs form{display:flex;gap:8px}
      #ofs-cs input{flex:1;height:40px;border:0;border-radius:12px;padding:0 10px;background:#07161c;color:#eef4f2}
      #ofs-cs button.go{height:40px;border:0;border-radius:12px;padding:0 12px;background:#eef4f2;color:#041016;font-weight:600;cursor:pointer}
      #ofs-cs .row{display:flex;gap:8px;margin-top:8px}
      #ofs-cs .row button{flex:1;height:36px;border:0;border-radius:12px;background:transparent;color:#9bb0aa;box-shadow:0 0 0 1px rgba(238,244,242,.12);cursor:pointer;font:12px ui-sans-serif,system-ui}
    `;
    document.head.appendChild(css);

    const err = document.createElement("div");
    err.id = "ofs-err";
    err.hidden = true;
    err.innerHTML = "<span></span><button type='button' id='ofs-err-route'>Route</button><button type='button' id='ofs-err-open'>Ask AI</button><button type='button' id='ofs-err-x'>Close</button>";
    document.body.appendChild(err);

    const btn = document.createElement("button");
    btn.id = "ofs-cs-btn";
    btn.type = "button";
    btn.textContent = "AI support";
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "ofs-cs";
    panel.hidden = true;
    panel.innerHTML =
      "<div class='k'>AI customer service</div>" +
      "<div id='ofs-cs-log'></div>" +
      "<form id='ofs-cs-form'><input id='ofs-cs-q' maxlength='280' placeholder='Ask about a plan, pay, or a break' /><button class='go' type='submit'>Send</button></form>" +
      "<div class='row'><button type='button' id='ofs-cs-mail'>Email support</button><button type='button' id='ofs-cs-close'>Close</button></div>";
    document.body.appendChild(panel);

    let scrollTimer;
    window.addEventListener("scroll", () => {
      document.body.classList.add("ofs-cs-scrolling");
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        document.body.classList.remove("ofs-cs-scrolling");
      }, 1000);
    }, { passive: true });

    function open() {
      panel.hidden = false;
      if (!document.getElementById("ofs-cs-log").childElementCount) {
        bubble("bot", "I can walk Claim $10, OFS One $99, Abyss One $299, listings, and checkout. If I miss, we write support.");
      }
    }
    btn.addEventListener("click", () => { panel.hidden = !panel.hidden; if (!panel.hidden) open(); });
    document.getElementById("ofs-cs-close").addEventListener("click", () => { panel.hidden = true; });
    document.getElementById("ofs-err-open").addEventListener("click", open);
    document.getElementById("ofs-err-x").addEventListener("click", () => { err.hidden = true; });
    document.getElementById("ofs-err-route").addEventListener("click", () => {
      const last = JSON.parse(sessionStorage.getItem(KEY) || "[]").slice(-1)[0];
      if (window.OFSMail) OFSMail.send({ route: "error", subject: "Page fault", body: "Page: " + location.href + "\n" + (last ? last.message : "") });
    });
    document.getElementById("ofs-cs-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("ofs-cs-q");
      const text = input.value.trim();
      if (!text) return;
      bubble("you", text);
      const out = answer(text);
      bubble("bot", out.text);
      if (!out.hit) {
        const sent = routeMail(text);
        bubble("bot", "Routed as " + (sent.route || "support") + ".");
      }
      input.value = "";
    });
    document.getElementById("ofs-cs-mail").addEventListener("click", () => {
      const last = JSON.parse(sessionStorage.getItem(KEY) || "[]").slice(-1)[0];
      routeMail(last ? last.message : "Support", "Page: " + location.href + "\n" + (last ? "Last error: " + last.message + "\n" : "") + "\nWhat happened:\n");
    });
  }

  window.addEventListener("error", (e) => logError("error", e.message || e.error));
  window.addEventListener("unhandledrejection", (e) => logError("reject", e.reason));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
