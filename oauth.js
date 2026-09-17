/** OFS Domains — Google OAuth2 email verification. */
(function (root) {
  const CID_KEY = "ofs.domains.oauth.google.cid";
  const SCOPE = "openid email profile";

  function clientId() {
    return String(localStorage.getItem(CID_KEY) || "").trim();
  }

  function setClientId(id) {
    localStorage.setItem(CID_KEY, String(id || "").trim());
  }

  function redirectUri() {
    return new URL("oauth.html", location.href).href.split("#")[0];
  }

  function start() {
    const id = clientId();
    if (!id) return { ok: false, error: "Set a Google OAuth client ID first." };
    const nonce = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
    sessionStorage.setItem("ofs.domains.oauth.nonce", nonce);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", id);
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("response_type", "id_token token");
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("nonce", nonce);
    u.searchParams.set("prompt", "select_account");
    location.href = u.toString();
    return { ok: true };
  }

  async function inspect(idToken) {
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken));
    if (!res.ok) throw new Error("Google could not confirm that token.");
    return res.json();
  }

  function parseHash() {
    const hash = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
    const search = new URLSearchParams(location.search);
    return {
      idToken: hash.get("id_token") || search.get("id_token") || "",
      error: hash.get("error") || search.get("error") || "",
    };
  }

  root.OFSOAuth = { clientId, setClientId, redirectUri, start, inspect, parseHash };
})(window);
