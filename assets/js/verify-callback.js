// Netlify Identity delivers account actions in the URL hash. This page
// also serves older OFS seat links, so send only Identity callbacks to
// the central processor on home.html and leave legacy query links here.
const identityCallback = new URLSearchParams(location.hash.slice(1));
const identityKeys = [
  "confirmation_token",
  "recovery_token",
  "invite_token",
  "email_change_token",
  "access_token",
];
if (identityKeys.some((key) => identityCallback.has(key))) {
  location.replace(new URL("home.html" + location.hash, location.href));
}
