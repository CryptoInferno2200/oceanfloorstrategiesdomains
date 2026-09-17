/** OFS Domains seat. Creator inbox is seeded, never painted. Tokens are hashed. */
(function (root) {
  const CREATOR = "oceanfloorstrategies2200@gmail.com";
  const KEY = "ofs.domains.seat.v3";
  const TTL_MS = 20 * 60 * 1000;
  const RESEND_MS = 60 * 1000;
  const MAX_TRIES = 5;

  function norm(email) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function valid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(email));
  }

  function empty() {
    return { whitelist: [CREATOR], members: {}, session: null };
  }

  function seed(state) {
    const e = CREATOR;
    if (!state.whitelist.includes(e)) state.whitelist.unshift(e);
    return state;
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || typeof raw !== "object") return seed(empty());
      return seed({
        whitelist: Array.isArray(raw.whitelist) ? raw.whitelist.map(norm) : [CREATOR],
        members: raw.members && typeof raw.members === "object" ? raw.members : {},
        session: raw.session ? norm(raw.session) : null,
      });
    } catch {
      return seed(empty());
    }
  }

  function save(state) {
    state = seed(state);
    state.syncedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
    try {
      window.dispatchEvent(new CustomEvent("ofs-whitelist-sync", { detail: { whitelist: state.whitelist.slice(), syncedAt: state.syncedAt } }));
    } catch (_) {}
  }

  function listWhitelist() {
    const state = load();
    const rows = state.whitelist.slice();
    if (!rows.includes(CREATOR)) rows.unshift(CREATOR);
    return rows.map((email) => {
      const m = state.members[email];
      return {
        email,
        operator: email === CREATOR,
        verified: Boolean(m && m.verified),
        pending: Boolean(m && !m.verified),
        status: m && m.verified ? "verified" : m ? "pending" : "invited",
      };
    });
  }

  function onSync(fn) {
    window.addEventListener("ofs-whitelist-sync", () => fn(load()));
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) fn(load());
    });
  }

  async function digest(value) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function equal(a, b) {
    const x = String(a || "");
    const y = String(b || "");
    if (x.length !== y.length) return false;
    let n = 0;
    for (let i = 0; i < x.length; i++) n |= x.charCodeAt(i) ^ y.charCodeAt(i);
    return n === 0;
  }

  function randomToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function isCreator(email) {
    return norm(email) === CREATOR;
  }

  function invited(state, email) {
    const e = norm(email);
    return isCreator(e) || state.whitelist.includes(e);
  }

  function free(state, email) {
    const e = norm(email);
    const m = state.members[e];
    return Boolean(invited(state, e) && m && m.verified);
  }

  function member(state, email) {
    return state.members[norm(email)] || null;
  }

  async function issueVerify(state, email, force) {
    const e = norm(email);
    const now = Date.now();
    const current = state.members[e] || {};
    if (!force && current.lastIssue && now - current.lastIssue < RESEND_MS) {
      return { ok: false, error: "Wait a minute before another message.", raw: null };
    }
    const raw = randomToken();
    const tokenHash = await digest("ofs-verify:" + e + ":" + raw);
    state.members[e] = {
      ...current,
      email: e,
      verified: Boolean(current.verified),
      tokenHash,
      expires: now + TTL_MS,
      tries: 0,
      lastIssue: now,
    };
    save(state);
    return { ok: true, raw, expires: now + TTL_MS };
  }

  async function consumeToken(email, raw) {
    const state = load();
    const e = norm(email);
    const m = state.members[e];
    if (!m || !m.tokenHash) return { ok: false, error: "No open verification for that inbox." };
    if (m.verified) return { ok: true, already: true };
    if (Date.now() > Number(m.expires || 0)) return { ok: false, error: "That link expired. Send a new one." };
    if (Number(m.tries || 0) >= MAX_TRIES) return { ok: false, error: "Too many tries. Send a new link." };
    const tokenHash = await digest("ofs-verify:" + e + ":" + String(raw || "").trim());
    if (!equal(tokenHash, m.tokenHash)) {
      m.tries = Number(m.tries || 0) + 1;
      save(state);
      return { ok: false, error: "That link is not valid." };
    }
    m.verified = true;
    m.tokenHash = null;
    m.expires = 0;
    m.tries = 0;
    state.session = e;
    save(state);
    return { ok: true };
  }

  function verifyUrl(email, raw) {
    const base = new URL("verify.html", location.href).href;
    const u = new URL(base);
    u.searchParams.set("e", norm(email));
    u.searchParams.set("t", raw);
    return u.href;
  }

  function mailVerify(email, raw) {
    const link = verifyUrl(email, raw);
    const body = "Only this inbox can finish the seat.\n\nOpen this link in the next 20 minutes:\n\n" + link + "\n\nIf you did not ask for this, ignore it.";
    if (root.OFSMail) {
      root.OFSMail.send({ route: "verify", user: norm(email), to: norm(email), subject: "Verify your OFS Domains seat", body });
    } else {
      location.href =
        "mailto:" + encodeURIComponent(norm(email)) +
        "?subject=" + encodeURIComponent("[OFS Verify] Verify your OFS Domains seat") +
        "&body=" + encodeURIComponent(body);
    }
    return link;
  }

  async function issueReset(state, email, force) {
    const e = norm(email);
    const now = Date.now();
    const current = state.members[e] || {};
    if (!current.hash && !isCreator(e)) return { ok: false, error: "No password on that seat yet.", raw: null };
    if (!force && current.lastReset && now - current.lastReset < RESEND_MS) {
      return { ok: false, error: "Wait a minute before another reset.", raw: null };
    }
    const raw = randomToken();
    const resetHash = await digest("ofs-reset:" + e + ":" + raw);
    state.members[e] = {
      ...current,
      email: e,
      resetHash,
      resetExpires: now + TTL_MS,
      resetTries: 0,
      lastReset: now,
    };
    save(state);
    return { ok: true, raw, expires: now + TTL_MS };
  }

  async function consumeReset(email, raw, password) {
    const state = load();
    const e = norm(email);
    const m = state.members[e];
    if (!m || !m.resetHash) return { ok: false, error: "No open reset for that inbox." };
    if (String(password || "").length < 8) return { ok: false, error: "Password needs 8 characters." };
    if (Date.now() > Number(m.resetExpires || 0)) return { ok: false, error: "That reset expired. Send a new one." };
    if (Number(m.resetTries || 0) >= MAX_TRIES) return { ok: false, error: "Too many tries. Send a new reset." };
    const resetHash = await digest("ofs-reset:" + e + ":" + String(raw || "").trim());
    if (!equal(resetHash, m.resetHash)) {
      m.resetTries = Number(m.resetTries || 0) + 1;
      save(state);
      return { ok: false, error: "That reset link is not valid." };
    }
    m.hash = await digest("ofs-pass:" + e + ":" + password);
    m.resetHash = null;
    m.resetExpires = 0;
    m.resetTries = 0;
    m.verified = true;
    state.session = e;
    save(state);
    return { ok: true };
  }

  function resetUrl(email, raw) {
    const base = new URL("reset.html", location.href).href;
    const u = new URL(base);
    u.searchParams.set("e", norm(email));
    u.searchParams.set("t", raw);
    return u.href;
  }

  root.OFSSeat = {
    CREATOR,
    TTL_MS,
    RESEND_MS,
    MAX_TRIES,
    norm,
    valid,
    load,
    save,
    digest,
    equal,
    isCreator,
    invited,
    free,
    member,
    issueVerify,
    consumeToken,
    verifyUrl,
    mailVerify,
    issueReset,
    consumeReset,
    resetUrl,
    listWhitelist,
    onSync,
  };
})(window);
