/** Signed-in account avatar in the upper right of every page. Pages can host it in an element marked data-ofs-avatar-slot. */
import { getUser, logout, onAuthChange } from "https://esm.sh/@netlify/identity@1.2.0";

const CACHE_KEY = "ofs.domains.avatar.v1";
const STYLE = `
  #ofs-avatar{position:fixed;top:12px;right:12px;z-index:2147482990;font:13px/1.4 ui-sans-serif,system-ui}
  [data-ofs-avatar-slot] #ofs-avatar{position:relative;top:auto;right:auto;z-index:25}
  #ofs-avatar[hidden]{display:none}
  #ofs-avatar-btn{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:50%;overflow:hidden;background:#cfe4dc;color:#041016;box-shadow:0 0 0 2px rgba(238,244,242,.22),0 6px 18px rgba(0,0,0,.35);font:600 15px/1 Georgia,serif;letter-spacing:.02em;cursor:pointer}
  #ofs-avatar-btn:focus-visible{outline:2px solid #cfe4dc;outline-offset:3px}
  #ofs-avatar-btn img{display:block;width:100%;height:100%;object-fit:cover}
  #ofs-avatar-menu{position:absolute;right:0;top:calc(100% + 8px);width:min(16rem,calc(100vw - 24px));padding:12px;border-radius:14px;background:rgba(8,22,28,.97);color:#eef4f2;box-shadow:0 0 0 1px rgba(238,244,242,.12),0 12px 32px rgba(0,0,0,.45)}
  #ofs-avatar-menu[hidden]{display:none}
  #ofs-avatar-menu .who{margin:0 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #ofs-avatar-menu .who small{display:block;color:#9bb0aa;font-size:12px}
  #ofs-avatar-menu a,#ofs-avatar-menu button{display:block;width:100%;height:auto;margin:6px 0 0;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:#eef4f2;box-shadow:0 0 0 1px rgba(238,244,242,.12);font:inherit;text-align:left;text-decoration:none;cursor:pointer}
  #ofs-avatar-menu a:hover,#ofs-avatar-menu button:hover{background:rgba(238,244,242,.06)}
`;

let current = null;
let root = null;

function readCache(email) {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return saved && saved.email === email ? saved : null;
  } catch (_) {
    return null;
  }
}

function writeCache(value) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    else localStorage.removeItem(CACHE_KEY);
  } catch (_) {}
}

function initials(name, email) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.slice(0, 2).map((w) => w[0]).join("") : String(email || "?")[0];
  return letters.toUpperCase();
}

function mount() {
  if (root) return root;
  if (!document.getElementById("ofs-avatar-style")) {
    const style = document.createElement("style");
    style.id = "ofs-avatar-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  root = document.createElement("div");
  root.id = "ofs-avatar";
  root.hidden = true;
  root.innerHTML =
    "<button type='button' id='ofs-avatar-btn' aria-haspopup='true' aria-expanded='false' aria-controls='ofs-avatar-menu'></button>" +
    "<div id='ofs-avatar-menu' hidden><p class='who'></p><a href='profile.html'>Profile + photo</a><a href='vault.html'>Vault</a><button type='button' data-ofs-signout>Sign out</button></div>";
  (document.querySelector("[data-ofs-avatar-slot]") || document.body).appendChild(root);

  const btn = root.querySelector("#ofs-avatar-btn");
  const menu = root.querySelector("#ofs-avatar-menu");
  const toggle = (open) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) toggle(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      toggle(false);
      btn.focus();
    }
  });
  root.querySelector("[data-ofs-signout]").addEventListener("click", async () => {
    try { await logout(); } catch (_) {}
    writeCache(null);
    location.href = "home.html";
  });
  return root;
}

function paint() {
  if (!current) {
    if (root) root.hidden = true;
    return;
  }
  const el = mount();
  const btn = el.querySelector("#ofs-avatar-btn");
  const label = current.name || current.email;
  btn.setAttribute("aria-label", "Account menu for " + label);
  btn.title = label;
  btn.textContent = "";
  if (current.url) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = current.url;
    img.addEventListener("error", () => {
      btn.textContent = initials(current.name, current.email);
    });
    btn.appendChild(img);
  } else {
    btn.textContent = initials(current.name, current.email);
  }
  const who = el.querySelector(".who");
  who.textContent = label;
  if (current.name) {
    const small = document.createElement("small");
    small.textContent = current.email;
    who.appendChild(small);
  }
  el.hidden = false;
}

async function refresh(user) {
  const email = user && user.email ? String(user.email).trim().toLowerCase() : "";
  if (!email) {
    current = null;
    writeCache(null);
    paint();
    return;
  }
  // Paint right away from the cache, then confirm against the saved profile.
  const cached = readCache(email);
  current = { email, name: (cached && cached.name) || user.name || "", url: (cached && cached.url) || user.pictureUrl || "" };
  paint();
  try {
    const response = await fetch("/api/profile", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const result = await response.json();
    current = { email, name: (result.profile && result.profile.displayName) || user.name || "", url: result.avatarUrl || "" };
    writeCache(current);
    paint();
  } catch (_) {}
}

// The profile page announces a new photo or display name without a reload.
window.addEventListener("ofs-avatar-change", (e) => {
  if (!current) return;
  const detail = e.detail || {};
  if ("url" in detail) current.url = detail.url || "";
  if ("name" in detail) current.name = detail.name || "";
  writeCache(current);
  paint();
});

onAuthChange((event, user) => {
  if (event === "login" || event === "logout" || event === "user_updated") refresh(user).catch(() => {});
});

getUser().then(refresh).catch(() => {});
