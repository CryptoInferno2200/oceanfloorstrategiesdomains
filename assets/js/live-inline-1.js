import { getUser } from "https://esm.sh/@netlify/identity@1.2.0";

// Receipts are rendered only from the signed-in account's server purchases.
// Only ?fqdn= and ?id= are read; any other parameter (due, complimentary, bundle…) is ignored.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const wantId = String(q.get("id") || "").trim();
const wantFqdn = String(q.get("fqdn") || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const LABELS = (window.OFSPurchases && OFSPurchases.LABELS) || {};
const LISTING = { both: "Web + Web3", web: "Web only", web3: "Web3 only" };
const STATUS = { paid: "Paid", complimentary: "Complimentary", pending: "Payment pending", refunded: "Refunded", canceled: "Canceled" };
const DNS = { active: "Live on OFS nameservers", pending: "Connecting to OFS nameservers…", failed: "Needs attention — we’ll be in touch" };
const REGISTRATION = { registered: "Registered · WHOIS privacy on", queued: "Registering…", retrying: "Registering… (retrying)", failed: "Needs attention — we’ll be in touch" };

function when(value) {
  const date = new Date(value);
  return isNaN(date) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function list(rows) {
  $("list").replaceChildren(...rows.map((value) => {
    const row = document.createElement("li");
    row.textContent = value;
    return row;
  }));
}

function carryNav(fqdn) {
  if (!fqdn) return;
  const carry = "?fqdn=" + encodeURIComponent(fqdn);
  document.querySelectorAll("nav a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.href = a.getAttribute("href").split("?")[0] + carry;
    });
  });
}

function notFound(signedIn) {
  $("title").textContent = "No receipt found";
  $("sub").textContent = signedIn
    ? (wantFqdn ? "No purchase for " + wantFqdn + " on this account yet. If you just paid, it can take a minute — refresh to check again." : "Open your vault to see every purchase on this account.")
    : "Sign in to see receipts for your account.";
  list([]);
  $("toSignin").hidden = signedIn;
}

function render(p) {
  const cents = Number(p.amount_cents || 0);
  const pay = p.complimentary || cents === 0 ? "Complimentary" : "$" + (cents / 100).toFixed(2);
  const fqdn = String(p.fqdn || "");
  $("title").textContent = fqdn || p.label || "Receipt";
  $("sub").textContent = (p.label || LABELS[p.plan] || p.plan || "Service") + " · " + (STATUS[p.status] || p.status || "");
  const rows = [
    "Plan · " + (p.label || LABELS[p.plan] || p.plan || "Service"),
    "Amount · " + pay,
    "Status · " + (STATUS[p.status] || p.status || "unknown"),
  ];
  if (fqdn) rows.push("Name · " + fqdn);
  if (p.listing) rows.push("Listing · " + (LISTING[p.listing] || p.listing));
  if (p.purchased_at) rows.push("Purchased · " + when(p.purchased_at));
  if (p.renews_at) rows.push("Renews · " + when(p.renews_at));
  if (p.registration_status) rows.push("Registration · " + (REGISTRATION[p.registration_status] || p.registration_status));
  if (p.registration_status === "registered" && p.dns_status) rows.push("DNS · " + (DNS[p.dns_status] || p.dns_status));
  list(rows);
  if (fqdn) {
    const site = $("toHost");
    site.href = "host.html?fqdn=" + encodeURIComponent(fqdn);
    site.hidden = false;
    const bind = $("toBind");
    bind.href = "bind.html?fqdn=" + encodeURIComponent(fqdn);
    bind.hidden = false;
  }
  carryNav(fqdn);
}

async function load() {
  let user = null;
  try { user = await getUser(); } catch (_) {}
  if (!user || !user.email) return notFound(false);
  if (!wantId && !wantFqdn) return notFound(true);
  try {
    const response = await fetch("/api/purchases", { headers: { Accept: "application/json" } });
    if (response.status === 401) return notFound(false);
    if (!response.ok) throw new Error("purchases " + response.status);
    const result = await response.json();
    const rows = (Array.isArray(result.purchases) ? result.purchases : [])
      .slice()
      .sort((a, b) => new Date(b.purchased_at || 0) - new Date(a.purchased_at || 0));
    const match = (wantId && rows.find((r) => String(r.id) === wantId))
      || (wantFqdn && rows.find((r) => String(r.fqdn || "").toLowerCase() === wantFqdn));
    if (!match) return notFound(true);
    render(match);
  } catch (_) {
    $("title").textContent = "Receipt unavailable";
    $("sub").textContent = "Your receipt could not load. Refresh to try again, or open your vault.";
    list([]);
  }
}

load();
