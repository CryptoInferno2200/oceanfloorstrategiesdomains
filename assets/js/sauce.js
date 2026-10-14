import { githubButton } from "./github-push.js";

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

async function api(url, opts = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json" }, ...opts });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = "home.html?signin=1&next=sauce.html";
    throw new Error("Sign in to use the Sauce Button.");
  }
  if (!response.ok) throw Object.assign(new Error(result.error || "Something went wrong."), { upgrade: result.upgrade, status: response.status });
  return result;
}

function step(name, state) {
  const li = document.querySelector(`#steps [data-step="${name}"]`);
  if (li) li.className = state;
}

// Starts checkout only after the user confirms in the review panel. Checkout re-checks the name before charging.
async function publish(launch, button, error) {
  button.disabled = true;
  button.textContent = "Opening secure checkout…";
  error.hidden = true;
  try {
    const { url } = await api("/api/create-checkout", {
      method: "POST",
      body: JSON.stringify({ fqdn: launch.fqdn, plan: "one", listing: "both", sauce: launch.slug }),
    });
    location.href = url;
  } catch (failure) {
    button.disabled = false;
    button.textContent = "Pay OFS One $99 and publish";
    error.replaceChildren(failure.message);
    if (failure.status === 409) {
      // The name was taken since Sauce picked it. Nothing was charged; start a fresh run from the same problem.
      const again = el("button", { type: "button", className: "btn ghost", textContent: "Regenerate with a new name" });
      again.addEventListener("click", () => regenerate(launch));
      error.append(" Nothing was charged. ", again);
    }
    error.hidden = false;
  }
}

function regenerate(launch) {
  $("problem").value = launch.problem || "";
  $("audience").value = launch.audience || "";
  $("form").scrollIntoView({ behavior: "smooth" });
  $("go").focus({ preventScroll: true });
}

function review(launch) {
  const error = el("p", { className: "lead err", hidden: true });
  const pay = el("button", { type: "button", textContent: "Pay OFS One $99 and publish" });
  const cancel = el("button", { type: "button", className: "btn ghost", textContent: "Not yet" });
  const panel = el("div", { className: "review", hidden: true },
    el("div", { className: "k", textContent: "Review & publish" }),
    el("p", { className: "lead", textContent: "Check the brief above and the site preview. Publishing claims " + launch.fqdn + " and makes /s/" + launch.slug + " public." }),
    el("p", { className: "lead", textContent: "The name’s availability is confirmed at checkout. If it was registered elsewhere in the meantime, you won’t be charged and can regenerate." }),
    el("div", { className: "row" }, pay, cancel),
    error);
  const open = el("button", { type: "button", textContent: "Review & publish" });
  open.addEventListener("click", () => { panel.hidden = false; open.hidden = true; pay.focus(); });
  cancel.addEventListener("click", () => { panel.hidden = true; open.hidden = false; });
  pay.addEventListener("click", () => publish(launch, pay, error));
  return { open, panel };
}

function card(launch) {
  const b = typeof launch.brief === "string" ? JSON.parse(launch.brief) : launch.brief;
  const live = launch.status === "published";
  const kit = b.launchKit || {};
  const section = (title, items) => items && items.length
    ? el("details", {}, el("summary", { textContent: title }), el("ul", {}, ...items.map((t) => el("li", { textContent: t }))))
    : null;
  const actions = el("div", { className: "row" },
    el("a", { className: "btn ghost", href: "/s/" + launch.slug, target: "_blank", rel: "noopener", textContent: live ? "Open live site" : "Preview site" }));
  let panel = null;
  if (!live) {
    const flow = review(launch);
    actions.prepend(flow.open);
    panel = flow.panel;
  }
  const github = githubButton({ kind: "sauce", id: launch.slug, repo: launch.slug, ghostClass: "btn ghost" });
  actions.append(github.toggle);
  return el("article", { className: "card", id: "launch-" + launch.slug },
    el("div", { className: "launch" },
      launch.has_logo !== false ? el("img", { src: "/api/sauce-logo/" + launch.slug, alt: b.name + " logo" }) : el("span"),
      el("div", {},
        el("span", { className: "pill" + (live ? " live" : ""), textContent: live ? "Published" : "Awaiting OFS One" }),
        el("span", { className: "pill", textContent: "OFS share " + launch.revenue_share_pct + "%" }),
        el("h2", { textContent: b.name }),
        el("p", { className: "lead", textContent: b.tagline }),
        el("p", { className: "lead", textContent: launch.fqdn + " · " + (b.kind === "application" ? "Application" : "Website") + " · /s/" + launch.slug }))),
    el("p", {}, b.solution),
    section("Launch kit · social posts", kit.social),
    section("Launch kit · launch-day checklist", kit.checklist),
    kit.email ? el("details", {}, el("summary", { textContent: "Launch kit · announcement email" }), el("p", { className: "lead", textContent: kit.email })) : null,
    section("Launch kit · SEO keywords", kit.keywords && [kit.keywords.join(", ")]),
    actions,
    panel,
    github.panel);
}

async function loadLaunches() {
  const { launches } = await api("/api/sauce");
  $("launches").replaceChildren(...launches.map(card));
  return launches;
}

async function run(e) {
  e.preventDefault();
  $("go").disabled = true;
  $("run").hidden = false;
  $("run-error").hidden = true;
  document.querySelectorAll("#steps li").forEach((li) => (li.className = ""));
  let current = "idea";
  try {
    step("idea", "run"); step("name", "run"); step("kit", "run");
    const { launch } = await api("/api/sauce", {
      method: "POST",
      body: JSON.stringify({ problem: $("problem").value, audience: $("audience").value, acceptTerms: $("accept").checked }),
    });
    step("idea", "done"); step("name", "done"); step("kit", "done");
    current = "logo"; step("logo", "run");
    await api("/api/sauce-logo/" + launch.slug, { method: "POST" });
    step("logo", "done");
    current = "host"; step("host", "run");
    await loadLaunches();
    step("host", "done");
    // Stop here: the user reviews the brief and preview, then confirms publishing from the card.
    $("launch-" + launch.slug)?.scrollIntoView({ behavior: "smooth" });
    $("launch-" + launch.slug)?.querySelector("button")?.focus({ preventScroll: true });
  } catch (error) {
    step(current, "fail");
    if (current === "idea") { step("name", ""); step("kit", ""); }
    $("run-error").textContent = error.message;
    if (error.upgrade) $("run-error").append(" ", el("a", { href: error.upgrade, textContent: "Upgrade" }));
    $("run-error").hidden = false;
    loadLaunches().catch(() => {});
  } finally {
    $("go").disabled = false;
  }
}

async function confirmLaunch(slug) {
  // The Stripe webhook publishes the launch; give it a few seconds to land.
  for (let i = 0; i < 6; i += 1) {
    const launches = await loadLaunches().catch(() => []);
    const launch = launches.find((l) => l.slug === slug);
    if (launch && launch.status === "published") {
      $("launch-" + slug)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    await wait(2500);
  }
}

const DRAFT = "ofs.domains.sauce-draft";
const signInUrl = "home.html?signin=1&next=sauce.html";

let user = null;
try {
  // Loaded lazily so the page keeps working even if the identity library cannot load.
  const { getUser } = await import("https://esm.sh/@netlify/identity@1.2.0");
  user = await getUser();
} catch (_) {}

try {
  const draft = JSON.parse(sessionStorage.getItem(DRAFT) || "null");
  if (draft) {
    $("problem").value = draft.problem || "";
    $("audience").value = draft.audience || "";
    $("accept").checked = Boolean(draft.accept);
    sessionStorage.removeItem(DRAFT);
  }
} catch (_) {}

$("form").addEventListener("submit", (e) => {
  if (user && user.email) return run(e);
  e.preventDefault();
  try {
    sessionStorage.setItem(DRAFT, JSON.stringify({ problem: $("problem").value, audience: $("audience").value, accept: $("accept").checked }));
  } catch (_) {}
  location.href = signInUrl;
});

if (!user || !user.email) {
  $("signin").hidden = false;
  $("go").textContent = "Sign in and press the Sauce Button";
} else {
  const launched = new URLSearchParams(location.search).get("launched");
  if (launched) confirmLaunch(launched);
  else loadLaunches().catch(() => {});
}
