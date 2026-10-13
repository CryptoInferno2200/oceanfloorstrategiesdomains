import { getUser } from "https://esm.sh/@netlify/identity@1.2.0";

const $ = (id) => document.getElementById(id);
const DEMO_DESCRIPTION = "Live kelp cover for the Gulf. Hosted on OFS Domains.";
const SETTLED = new Set(["paid", "complimentary"]);

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = String(value || "");
  return span.innerHTML;
}

function when(value) {
  const date = new Date(value);
  return isNaN(date) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function getJson(url, key) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(url + " " + response.status);
  const result = await response.json();
  return Array.isArray(result[key]) ? result[key] : [];
}

function localPurchases(email) {
  return window.OFSPurchases ? OFSPurchases.forAccount(email) : [];
}

function localProjects() {
  const sites = window.OFSHost ? OFSHost.load() : [];
  return sites
    .filter((site) => !(site.fqdn === "kelpchart.com" && site.description === DEMO_DESCRIPTION))
    .map((site) => ({
      fqdn: site.fqdn,
      name: site.businessName,
      description: site.description,
      plan: site.plan,
      listing: site.listing,
      updated_at: site.publishedAt,
    }));
}

function paintPurchases(rows, remote) {
  const ul = $("history");
  if (!rows.length) {
    ul.innerHTML = "<li class='empty'>No purchases yet. Claim, OFS One, Abyss One, and complimentary services appear here.</li>";
    return;
  }
  ul.innerHTML = rows.map((r) => {
    const due = remote ? Number(r.amount_cents || 0) / 100 : Number(r.due || 0);
    const pay = r.complimentary || due === 0 ? "Complimentary" : "$" + due.toFixed(2);
    const renewal = r.renews_at ? " · renews " + when(r.renews_at) : "";
    return "<li><strong>" + escapeHtml(r.label) + "</strong><span class='row-side'>" + escapeHtml(pay) + "</span>" +
      "<span class='row-meta'>" + escapeHtml(r.fqdn || "Account service") + " · " + escapeHtml(r.status) + " · " +
      escapeHtml(when(r.purchased_at || r.at)) + escapeHtml(renewal) + "</span></li>";
  }).join("");
}

function paintProjects(rows, purchases) {
  const ul = $("projects");
  if (!rows.length) {
    ul.innerHTML = "<li class='empty'>No projects yet. Describe one on the Home build desk or in Auto to get started.</li>";
    return;
  }
  const paid = new Set(purchases.filter((p) => SETTLED.has(p.status)).map((p) => p.fqdn));
  ul.innerHTML = rows.map((p) => {
    const settled = paid.has(p.fqdn);
    const stage = settled ? "In development" : "Awaiting checkout";
    const href = settled
      ? "live.html?fqdn=" + encodeURIComponent(p.fqdn)
      : "checkout.html?bundle=" + encodeURIComponent(p.plan || "one") + "&listing=" + encodeURIComponent(p.listing || "both") + "&fqdn=" + encodeURIComponent(p.fqdn);
    const label = window.OFSPurchases && OFSPurchases.LABELS[p.plan] || p.plan || "";
    return "<li><strong>" + escapeHtml(p.name || p.fqdn) + "</strong><a class='row-side' style='color:var(--fg)' href='" + escapeHtml(href) + "'>" +
      (settled ? "Continue" : "Checkout") + "</a>" +
      "<span class='row-meta'>" + escapeHtml(p.fqdn) + " · " + escapeHtml(stage) + (label ? " · " + escapeHtml(label) : "") +
      (p.updated_at ? " · updated " + escapeHtml(when(p.updated_at)) : "") + "</span>" +
      (p.description ? "<span class='row-meta'>" + escapeHtml(p.description) + "</span>" : "") + "</li>";
  }).join("");
}

async function load() {
  $("history").innerHTML = "<li class='empty'>Loading purchase history…</li>";
  $("projects").innerHTML = "<li class='empty'>Loading projects…</li>";

  let user = null;
  try { user = await getUser(); } catch (_) {}
  const email = user && user.email ? String(user.email).trim().toLowerCase() : "";

  if (!email) {
    $("account-name").textContent = "You’re not signed in";
    $("vault-who").textContent = "Sign in to load your purchase history and projects across devices. Showing what’s saved on this device.";
    $("account-signin").hidden = false;
    const purchases = localPurchases();
    paintPurchases(purchases, false);
    paintProjects(localProjects(), purchases);
    return;
  }

  $("account-name").textContent = (user.name || email);
  $("vault-who").textContent = "Signed in as " + email;
  if (window.OFSSeat) {
    const state = OFSSeat.load();
    if (state.session !== email) { state.session = email; OFSSeat.save(state); }
  }

  const [purchaseResult, projectResult] = await Promise.allSettled([
    getJson("/api/purchases", "purchases"),
    getJson("/api/projects", "projects"),
  ]);

  const remotePurchases = purchaseResult.status === "fulfilled";
  const purchases = remotePurchases ? purchaseResult.value : localPurchases(email);
  paintPurchases(purchases, remotePurchases);
  $("history-note").textContent = remotePurchases
    ? "Every paid and complimentary service on this account."
    : "Showing this device’s saved receipts until sync is available.";

  const seen = new Set();
  const projects = (projectResult.status === "fulfilled" ? projectResult.value : [])
    .concat(localProjects())
    .filter((p) => p.fqdn && !seen.has(p.fqdn) && seen.add(p.fqdn));
  paintProjects(projects, purchases);
  if (projectResult.status !== "fulfilled") $("projects-note").textContent = "Showing projects saved on this device until sync is available.";
}

load().catch(() => {
  $("account-name").textContent = "Profile";
  $("vault-who").textContent = "Your profile could not load. Refresh to try again.";
});
