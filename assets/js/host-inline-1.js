import { getUser } from "https://esm.sh/@netlify/identity@1.2.0";

// Real hosting: sites are saved to the account and served on the name by the OFS web edge.
const $ = (id) => document.getElementById(id);
const FIELDS = ["businessName", "tagline", "description", "contactEmail", "phone", "location"];
const COLUMNS = { businessName: "business_name", tagline: "tagline", description: "description", contactEmail: "contact_email", phone: "phone", location: "location" };
const REGISTRATION = { queued: "Registering…", retrying: "Registering… (retrying)", failed: "Registration needs attention" };
let names = [];

function state(n) {
  if (n.registration_status !== "registered") return REGISTRATION[n.registration_status] || "Waiting for registration";
  if (n.dns_status !== "active") return "Connecting to OFS nameservers…";
  if (n.sauce_live) return "Live · Sauce launch";
  if (n.business_name && n.published) return "Live · business site";
  return "Live · coming-soon page";
}

function paint() {
  const list = $("list");
  if (!names.length) {
    const empty = document.createElement("li");
    const link = document.createElement("a"); link.href = "name.html"; link.textContent = "Claim a name";
    empty.append("No names on this account yet. ", link);
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...names.map((n) => {
    const row = document.createElement("li");
    const detail = document.createElement("span");
    const meta = document.createElement("span"); meta.className = "k"; meta.textContent = state(n);
    detail.append(n.business_name ? n.fqdn + " · " + n.business_name : n.fqdn, document.createElement("br"), meta);
    row.append(detail);
    if (n.registration_status === "registered" && n.dns_status === "active") {
      const link = document.createElement("a"); link.href = "https://" + n.fqdn + "/"; link.target = "_blank"; link.rel = "noopener"; link.textContent = "Open site";
      row.append(link);
    }
    return row;
  }));
}

function fill() {
  const n = names.find((row) => row.fqdn === $("fqdn").value) || {};
  for (const field of FIELDS) $(field).value = n[COLUMNS[field]] || "";
  $("published").checked = n.published !== false;
  $("saved").textContent = n.sauce_live ? "This name shows its published Sauce launch; the business site appears if that launch is removed." : "";
}

async function load() {
  let user = null;
  try { user = await getUser(); } catch (_) {}
  if (!user || !user.email) { $("status").textContent = "Sign in to host a site on your names."; return; }
  try {
    const response = await fetch("/api/hosting", { headers: { Accept: "application/json" } });
    if (response.status === 401) { $("status").textContent = "Sign in to host a site on your names."; return; }
    if (!response.ok) throw new Error("hosting " + response.status);
    names = (await response.json()).names || [];
  } catch (_) {
    $("status").textContent = "Your names could not load. Refresh to try again.";
    return;
  }
  paint();
  if (!names.length) { $("status").textContent = "Claim a name first, then come back to put your business on it."; return; }
  $("status").hidden = true;
  const want = new URLSearchParams(location.search).get("fqdn");
  $("fqdn").replaceChildren(...names.map((n) => new Option(n.fqdn, n.fqdn, false, n.fqdn === want)));
  $("form").hidden = false;
  fill();
}

$("fqdn").addEventListener("change", fill);
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { fqdn: $("fqdn").value, published: $("published").checked };
  for (const field of FIELDS) body[field] = $(field).value;
  $("saved").textContent = "Publishing…";
  try {
    const response = await fetch("/api/hosting", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { $("saved").textContent = result.error || "Could not publish. Try again."; return; }
    names = names.map((n) => (n.fqdn === result.name.fqdn ? result.name : n));
    paint();
    const live = result.name.registration_status === "registered" && result.name.dns_status === "active";
    $("saved").textContent = !body.published ? "Saved. The name shows a coming-soon page." : live ? "Published. It appears on " + body.fqdn + " within a minute." : "Saved. It goes live as soon as the name finishes connecting.";
  } catch (_) {
    $("saved").textContent = "Could not publish. Check your connection and try again.";
  }
});

load();
