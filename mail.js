/** OFS Domains — routed mail with OFS-MAIL/1 envelopes. Transport is the mail client over TLS. */
(function (root) {
  const OPERATOR = "oceanfloorstrategies2200@gmail.com";
  const KEY = "ofs.domains.mail.v2";
  const WRAP = "ofs.domains.mail.wrap";
  const PROTO = "OFS-MAIL/1";
  const ALG = "AES-GCM";

  const ROUTES = {
    verify: { id: "verify", to: "user", prefix: "[OFS Verify]", blurb: "Seat link to the inbox that asked." },
    invite: { id: "invite", to: "user", prefix: "[OFS Invite]", blurb: "Invite to the listed inbox." },
    support: { id: "support", to: OPERATOR, prefix: "[OFS Support]", blurb: "General help to the operator seat." },
    billing: { id: "billing", to: OPERATOR, prefix: "[OFS Billing]", blurb: "Stripe, receipt, refund." },
    error: { id: "error", to: OPERATOR, prefix: "[OFS Error]", blurb: "Broken page, console fault." },
    claim: { id: "claim", to: OPERATOR, prefix: "[OFS Claim]", blurb: "Name dispute or transfer." },
  };

  function classify(text) {
    const q = String(text || "");
    if (/refund|chargeback|stripe|invoice|receipt/i.test(q)) return "billing";
    if (/error|broke|bug|crash|blank|stack/i.test(q)) return "error";
    if (/verify|password|sign ?in|login|whitelist|invite/i.test(q)) return "support";
    if (/whois|transfer|claim name|taken|hijack/i.test(q)) return "claim";
    return "support";
  }

  function b64(bytes) {
    let s = "";
    bytes.forEach((n) => { s += String.fromCharCode(n); });
    return btoa(s);
  }

  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function hex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function digest(value) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
    return hex(buf);
  }

  async function wrapKey() {
    let raw = localStorage.getItem(WRAP);
    if (!raw) {
      raw = b64(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem(WRAP, raw);
    }
    return crypto.subtle.importKey("raw", unb64(raw), ALG, false, ["encrypt", "decrypt"]);
  }

  async function seal(plain) {
    const key = await wrapKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, new TextEncoder().encode(plain));
    return { proto: PROTO, alg: "AES-256-GCM", iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }

  async function open(env) {
    if (!env || !env.ct || !env.iv) return null;
    const key = await wrapKey();
    const pt = await crypto.subtle.decrypt({ name: ALG, iv: unb64(env.iv) }, key, unb64(env.ct));
    return new TextDecoder().decode(pt);
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(rows) {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-40)));
  }

  function envelopeText(opts, digestHex) {
    return (
      PROTO + "\n" +
      "route: " + (opts.route || "support") + "\n" +
      "sha256: " + digestHex + "\n" +
      "transport: mail-client TLS\n\n" +
      String(opts.body || "")
    );
  }

  function hrefFor(opts, digestHex) {
    const route = ROUTES[opts.route] || ROUTES.support;
    const to = opts.to || (route.to === "user" ? opts.user : OPERATOR);
    const subject = [route.prefix, opts.subject || route.id].filter(Boolean).join(" ");
    const body = envelopeText(opts, digestHex || "pending");
    return (
      "mailto:" + encodeURIComponent(to) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body)
    );
  }

  function send(opts) {
    const route = ROUTES[opts.route] || ROUTES.support;
    const to = opts.to || (route.to === "user" ? opts.user : OPERATOR);
    if (!to) return { ok: false, error: "No inbox for that route." };
    const href = hrefFor({ ...opts, to, route: route.id });
    const ticket = {
      id: "m" + Date.now().toString(36),
      route: route.id,
      proto: PROTO,
      at: Date.now(),
      path: location.pathname,
    };
    Promise.all([digest(to), digest(opts.subject || ""), digest(opts.body || ""), seal(JSON.stringify({ to, subject: opts.subject || route.id, body: opts.body || "" }))])
      .then(([toHash, subjectHash, bodyHash, env]) => {
        ticket.toHash = toHash;
        ticket.subjectHash = subjectHash;
        ticket.bodyHash = bodyHash;
        ticket.env = env;
        const rows = load();
        rows.push(ticket);
        save(rows);
      })
      .catch(() => {
        const rows = load();
        rows.push(ticket);
        save(rows);
      });
    if (opts.open !== false) location.href = href;
    return { ok: true, href, ticket, route: route.id, to, proto: PROTO };
  }

  async function deliverVerify(email, link) {
    const to = String(email || "").trim().toLowerCase();
    const body = "OFS Domains\n\nConfirm this seat. The link works for 20 minutes and one use.\n\n" + link + "\n\nIf you did not ask for this, ignore it.";
    send({ route: "verify", to, user: to, subject: "Verify your OFS Domains seat", body, open: false });
    try {
      const res = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: "[OFS Verify] Confirm your seat",
          _template: "box",
          message: body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, via: "formsubmit", data };
    } catch (err) {
      return { ok: false, via: "none", error: String(err && err.message || err) };
    }
  }

  root.OFSMail = { OPERATOR, ROUTES, PROTO, ALG, classify, load, send, hrefFor, seal, open, digest, deliverVerify };
})(window);
