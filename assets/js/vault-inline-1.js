import { getUser } from "https://esm.sh/@netlify/identity@1.2.0";

const $ = (id) => document.getElementById(id);
const LABELS = (window.OFSPurchases && OFSPurchases.LABELS) || {};
const REGISTRATION = {
  registered: { text: "Registered", tone: "ok" },
  queued: { text: "Registering…", tone: "wait" },
  retrying: { text: "Registering…", tone: "wait" },
  failed: { text: "Needs attention", tone: "bad" },
};

function when(value) {
  const date = new Date(value);
  return isNaN(date) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function text(tag, value, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(value || "");
  return el;
}

function show(rows, remote) {
  const list = $("history");
  if (!rows.length) {
    list.replaceChildren(text("li", remote
      ? "No purchases on this account yet. Claims, OFS One, Abyss One, and complimentary services appear here."
      : "No receipts saved on this device.", "empty"));
    return;
  }
  list.replaceChildren(...rows.map((r) => {
    const cents = remote ? Number(r.amount_cents || 0) : Math.round(Number(r.due || 0) * 100);
    const pay = r.complimentary || cents === 0 ? "Complimentary" : "$" + (cents / 100).toFixed(2);
    const row = document.createElement("li");
    row.append(text("strong", r.label || LABELS[r.plan] || r.plan || "Service"), text("span", pay, "row-side"));
    const meta = text("span", [
      r.fqdn || "Account service",
      r.status || "",
      when(r.purchased_at || r.at),
      r.renews_at ? "renews " + when(r.renews_at) : "",
    ].filter(Boolean).join(" · "), "row-meta");
    const reg = remote ? REGISTRATION[r.registration_status] : null;
    if (reg) {
      meta.append(" · ");
      meta.append(text("span", reg.text, "badge " + reg.tone));
    }
    row.append(meta);
    return row;
  }));
}

async function load() {
  $("history").replaceChildren(text("li", "Loading purchase history…", "empty"));
  let user = null;
  try { user = await getUser(); } catch (_) {}
  const email = user && user.email ? String(user.email).trim().toLowerCase() : "";

  if (!email) {
    $("who").textContent = "Sign in to see the services on your account.";
    $("vault-signin").hidden = false;
    $("history").replaceChildren();
    return;
  }

  try {
    const response = await fetch("/api/purchases", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("purchases " + response.status);
    const result = await response.json();
    $("who").textContent = "Vault for " + email;
    show(Array.isArray(result.purchases) ? result.purchases : [], true);
  } catch (_) {
    $("who").textContent = "Your account vault could not load. Showing receipts saved on this device — refresh to try again.";
    show(window.OFSPurchases ? OFSPurchases.forAccount(email) : [], false);
  }
}

load();
