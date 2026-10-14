import { getUser, updateUser } from "https://esm.sh/@netlify/identity@1.2.0";

const $ = (id) => document.getElementById(id);
const SETTLED = new Set(["paid", "complimentary"]);
const PROFILE_KEY = "ofs.domains.profile.v1";
const AVATAR_MAX = 512;
let signedInUser = null;
let avatarUrl = "";
const REGISTRATION = { registered: "Registered", queued: "Registering…", retrying: "Registering…", failed: "Needs attention" };

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

// Hosting previews saved in this browser. Shown separately; they are not account projects.
function paintPreviews() {
  const sites = window.OFSHost ? OFSHost.load() : [];
  $("previews-card").hidden = !sites.length;
  $("previews").innerHTML = sites.map((site) => {
    const href = window.OFSHost ? OFSHost.path(site.fqdn) : "site.html?n=" + encodeURIComponent(site.fqdn);
    return "<li><strong>" + escapeHtml(site.businessName || site.fqdn) + "</strong><a class='row-side' style='color:var(--fg)' href='" + escapeHtml(href) + "'>Open preview</a>" +
      "<span class='row-meta'>" + escapeHtml(site.fqdn) + " · preview on this device" +
      (site.publishedAt ? " · saved " + escapeHtml(when(site.publishedAt)) : "") + "</span></li>";
  }).join("");
}

function paintPurchases(rows, remote, signedIn = true) {
  const ul = $("history");
  if (!rows.length) {
    ul.innerHTML = signedIn
      ? "<li class='empty'>No purchases yet. Claim, OFS One, Abyss One, and complimentary services appear here.</li>"
      : "<li class='empty'>Sign in to see your purchase history.</li>";
    return;
  }
  ul.innerHTML = rows.map((r) => {
    const due = remote ? Number(r.amount_cents || 0) / 100 : Number(r.due || 0);
    const pay = r.complimentary || due === 0 ? "Complimentary" : "$" + due.toFixed(2);
    const renewal = r.renews_at ? " · renews " + when(r.renews_at) : "";
    const registration = remote && REGISTRATION[r.registration_status] ? " · " + REGISTRATION[r.registration_status] : "";
    return "<li><strong>" + escapeHtml(r.label) + "</strong><span class='row-side'>" + escapeHtml(pay) + "</span>" +
      "<span class='row-meta'>" + escapeHtml(r.fqdn || "Account service") + " · " + escapeHtml(r.status) + " · " +
      escapeHtml(when(r.purchased_at || r.at)) + escapeHtml(renewal) + escapeHtml(registration) + "</span></li>";
  }).join("");
}

function paintProjects(rows, purchases, signedIn = true) {
  const ul = $("projects");
  if (!rows.length) {
    ul.innerHTML = signedIn
      ? "<li class='empty'>No projects yet. Describe one on the Home build desk or in Auto to get started.</li>"
      : "<li class='empty'>Sign in to see your projects.</li>";
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
      (p.description ? "<span class='row-meta'>" + escapeHtml(p.description) + "</span>" : "") +
      (p.created_at ? "<span class='row-meta'><a style='color:var(--fg)' href='workspace.html?fqdn=" + escapeHtml(encodeURIComponent(p.fqdn)) + "'>Open database + sandbox</a></span>" : "") +
      "<span class='row-meta'><button type='button' class='row-del' data-delete-fqdn='" + escapeHtml(p.fqdn) + "'" +
      (p.id != null ? " data-delete-id='" + escapeHtml(p.id) + "'" : "") + ">Delete project</button></span></li>";
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
    $("avatar-box").hidden = true;
    signedInUser = null;
    paintPurchases([], false, false);
    paintProjects([], [], false);
    paintPreviews();
    return;
  }

  signedInUser = user;
  $("account-name").textContent = (user.name || email);
  $("vault-who").textContent = "Signed in as " + email;
  $("account-signin").hidden = true;
  $("avatar-box").hidden = false;
  paintAvatar();
  if (window.OFSSeat) {
    const state = OFSSeat.load();
    if (state.session !== email) { state.session = email; OFSSeat.save(state); }
  }

  const [purchaseResult, projectResult, profileResult] = await Promise.allSettled([
    getJson("/api/purchases", "purchases"),
    getJson("/api/projects", "projects"),
    fetch("/api/profile", { headers: { Accept: "application/json" } }).then((r) => r.ok ? r.json() : null),
  ]);
  if (profileResult.status === "fulfilled" && profileResult.value) applyProfile(profileResult.value);

  const remotePurchases = purchaseResult.status === "fulfilled";
  const purchases = remotePurchases ? purchaseResult.value : localPurchases(email);
  paintPurchases(purchases, remotePurchases);
  $("history-note").textContent = remotePurchases
    ? "Every paid and complimentary service on this account."
    : "Your account history could not load. Showing receipts saved on this device.";

  const projects = (projectResult.status === "fulfilled" ? projectResult.value : []).filter((p) => p.fqdn);
  paintProjects(projects, purchases);
  $("projects-note").textContent = projectResult.status === "fulfilled"
    ? "Sites and apps you started from the build desk or Auto."
    : "Your projects could not load. Use Refresh account data to try again.";
  paintPreviews();
}

async function deleteProject(button) {
  const fqdn = button.getAttribute("data-delete-fqdn") || "";
  const id = button.getAttribute("data-delete-id") || "";
  if (!window.confirm("Delete the project " + fqdn + "? Its workspace records and sandbox files are removed too. Purchases are not affected.")) return;
  button.disabled = true;
  $("projects-err").textContent = "";
  try {
    const response = await fetch("/api/projects", {
      method: "DELETE",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(id ? { id } : { fqdn }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Project could not be deleted.");
    }
    await load();
  } catch (error) {
    button.disabled = false;
    $("projects-err").textContent = error && error.message ? error.message : "Project could not be deleted.";
  }
}

function readForm() {
  const out = {};
  for (const el of $("form").elements) if (el.name) out[el.name] = el.value.trim();
  out.fqdn = String(out.fqdn || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return out;
}

// The account copy fills the form; a name passed in the URL still wins for the claimed name.
function applyProfile(result) {
  const saved = result.profile || {};
  const fromUrl = new URLSearchParams(location.search).get("fqdn");
  for (const el of $("form").elements) {
    if (!el.name || typeof saved[el.name] !== "string" || !saved[el.name]) continue;
    if (el.name === "fqdn" && fromUrl) continue;
    el.value = saved[el.name];
  }
  $("form").dispatchEvent(new Event("input"));
  avatarUrl = result.avatarUrl || "";
  if (saved.displayName) $("account-name").textContent = saved.displayName;
  paintAvatar();
}

function paintAvatar() {
  const box = $("avatar-preview");
  box.textContent = "";
  const name = $("displayName").value.trim() || (signedInUser && (signedInUser.name || signedInUser.email)) || "?";
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (avatarUrl) {
    const img = document.createElement("img");
    img.alt = "Your profile photo";
    img.src = avatarUrl;
    img.addEventListener("error", () => { box.textContent = letters; });
    box.appendChild(img);
  } else {
    box.textContent = letters;
  }
  $("avatar-remove").hidden = !avatarUrl;
}

async function saveProfile(quiet) {
  const profile = readForm();
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Object.assign({}, profile, { at: Date.now() }))); } catch (_) {}
  if (!signedInUser) {
    if (!quiet) $("saved").textContent = "Saved on this device. Sign in to keep your profile on your account.";
    return;
  }
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify(profile),
    keepalive: true,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Your profile could not be saved.");
  }
  const name = profile.displayName || "";
  if (name !== (signedInUser.name || "")) {
    try { signedInUser = await updateUser({ data: { full_name: name } }); } catch (_) {}
  }
  if (name) $("account-name").textContent = name;
  window.dispatchEvent(new CustomEvent("ofs-avatar-change", { detail: { name } }));
  paintAvatar();
}

$("save").addEventListener("click", async () => {
  const button = $("save");
  button.disabled = true;
  button.textContent = "Saving…";
  $("saved").textContent = "";
  try {
    await saveProfile(false);
    if (signedInUser) $("saved").textContent = "Profile saved to your account.";
  } catch (error) {
    $("saved").textContent = "";
    $("miss").textContent = error && error.message ? error.message : "Your profile could not be saved.";
  } finally {
    button.disabled = false;
    button.textContent = "Save profile";
  }
});

// Going live keeps the account copy current too.
$("form").addEventListener("submit", () => {
  saveProfile(true).catch(() => {});
});

// Crop to a centered square and shrink, so uploads stay small and look right in a circle.
async function squareImage(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_MAX, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("encode")), "image/jpeg", 0.9));
}

async function setAvatar(url) {
  avatarUrl = url || "";
  paintAvatar();
  window.dispatchEvent(new CustomEvent("ofs-avatar-change", { detail: { url: avatarUrl } }));
  try { signedInUser = await updateUser({ data: { avatar_url: avatarUrl } }); } catch (_) {}
}

$("avatar-file").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  $("avatar-err").textContent = "";
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    $("avatar-err").textContent = "Use a PNG, JPEG, WebP, or GIF image.";
    return;
  }
  let body;
  try {
    body = await squareImage(file);
  } catch (_) {
    body = file;
  }
  if (body.size > 2 * 1024 * 1024) {
    $("avatar-err").textContent = "Photos can be up to 2 MB.";
    return;
  }
  $("avatar-err").textContent = "Uploading photo…";
  try {
    const response = await fetch("/api/profile/avatar", { method: "POST", headers: { "content-type": body.type || file.type, Accept: "application/json" }, body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Your photo could not be uploaded.");
    $("avatar-err").textContent = "";
    await setAvatar(result.avatarUrl);
  } catch (error) {
    $("avatar-err").textContent = error && error.message ? error.message : "Your photo could not be uploaded.";
  }
});

$("avatar-remove").addEventListener("click", async () => {
  const button = $("avatar-remove");
  button.disabled = true;
  $("avatar-err").textContent = "";
  try {
    const response = await fetch("/api/profile/avatar", { method: "DELETE", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Your photo could not be removed.");
    await setAvatar("");
  } catch (error) {
    $("avatar-err").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("projects").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-delete-fqdn]");
  if (button) deleteProject(button);
});

window.addEventListener("ofs-profile-refresh", () => {
  load().catch(() => {});
});

load().catch(() => {
  $("account-name").textContent = "Profile";
  $("vault-who").textContent = "Your profile could not load. Refresh to try again.";
});
