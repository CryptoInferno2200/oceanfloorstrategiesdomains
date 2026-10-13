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
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

function step(name, state) {
  const li = document.querySelector(`#steps [data-step="${name}"]`);
  if (li) li.className = state;
}

async function publish(launch, button) {
  button.disabled = true;
  button.textContent = "Opening secure checkout…";
  try {
    const { url } = await api("/api/create-checkout", {
      method: "POST",
      body: JSON.stringify({ fqdn: launch.fqdn, plan: "one", listing: "both", sauce: launch.slug }),
    });
    location.href = url;
  } catch (error) {
    button.disabled = false;
    button.textContent = "Pay OFS One $99 and publish";
    alert(error.message);
  }
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
  if (!live) {
    const pay = el("button", { type: "button", textContent: "Pay OFS One $99 and publish" });
    pay.addEventListener("click", () => publish(launch, pay));
    actions.prepend(pay);
  }
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
    actions);
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
    current = "publish"; step("publish", "run");
    const button = document.querySelector(`#launch-${launch.slug} button`);
    $("launch-" + launch.slug)?.scrollIntoView({ behavior: "smooth" });
    if (button) await publish(launch, button);
  } catch (error) {
    step(current, "fail");
    if (current === "idea") { step("name", ""); step("kit", ""); }
    $("run-error").textContent = error.message;
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
