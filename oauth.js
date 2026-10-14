/** OFS Domains — legacy Google token helpers (oauth.html redirects to home.html). */
(function (root) {
  // The legacy client-side Google implicit flow (start/clientId) was removed: Google sign-in runs through
  // Netlify Identity on home.html. These helpers remain for the retired oauth.html script only.
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

  root.OFSOAuth = { inspect, parseHash };
})(window);
