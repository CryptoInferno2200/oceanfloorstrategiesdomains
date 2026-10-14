// Renders a Sauce launch as one static HTML page. Shared by hosting and the GitHub export.
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
// Hosted pages are static: no scripts, no forms, only same-site logos and https images.
export const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
};
const hex = (value: unknown, fallback: string) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback);

// logoSrc overrides where the logo loads from, e.g. a file next to the page in a GitHub export.
export function page(launch: Record<string, any>, preview: boolean, logoSrc = `/api/sauce-logo/${launch.slug}`) {
  const b = (typeof launch.brief === "string" ? JSON.parse(launch.brief) : launch.brief) as Record<string, any>;
  const primary = hex(b.colors?.primary, "#0f766e");
  const accent = hex(b.colors?.accent, "#f59e0b");
  const hasLogo = Boolean(launch.logo_key) && launch.logo_key !== "pending";
  const logo = hasLogo ? `<img class="logo" src="${esc(logoSrc)}" alt="${esc(b.name)} logo" width="56" height="56" />` : "";
  const features = (b.features || []).map((f: any) => `<article><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></article>`).join("");
  const steps = (b.steps || []).map((s: string, i: number) => `<li><span>${i + 1}</span>${esc(s)}</li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(b.name)} — ${esc(b.tagline)}</title>
<meta name="description" content="${esc(b.launchKit?.pitch || b.solution)}" />
<meta name="keywords" content="${esc((b.launchKit?.keywords || []).join(", "))}" />
${preview ? '<meta name="robots" content="noindex" />' : ""}
${hasLogo ? `<link rel="icon" href="${esc(logoSrc)}" />` : ""}
<style>
  :root { --p:${primary}; --a:${accent}; --ink:#0f172a; --muted:#475569; --bg:#fbfaf7; }
  * { box-sizing:border-box; }
  body { margin:0; font:17px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:1040px; margin:0 auto; padding:0 24px; }
  .bar { background:#111827; color:#fff; font-size:14px; text-align:center; padding:10px 16px; }
  .bar a { color:#fde68a; }
  header.top { display:flex; align-items:center; gap:14px; padding:22px 0; }
  .logo { border-radius:14px; object-fit:cover; }
  .brand { font-weight:700; font-size:20px; letter-spacing:-.01em; }
  .hero { padding:56px 0 72px; display:grid; gap:20px; }
  .hero h1 { font:400 clamp(40px,7vw,76px)/1.02 Georgia,serif; letter-spacing:-.03em; margin:0; max-width:14ch; }
  .hero p { font-size:20px; color:var(--muted); max-width:60ch; margin:0; }
  .cta { display:inline-block; background:var(--p); color:#fff; padding:15px 26px; border-radius:999px; text-decoration:none; font-weight:600; width:max-content; }
  .chip { display:inline-block; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--p); font-weight:700; }
  section { padding:56px 0; border-top:1px solid #e7e5e4; }
  section h2 { font:400 34px/1.15 Georgia,serif; margin:8px 0 18px; }
  .split { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:32px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
  .grid article { background:#fff; border-radius:18px; padding:22px; box-shadow:0 1px 0 #e7e5e4, 0 12px 30px -20px rgba(15,23,42,.25); border-top:4px solid var(--a); }
  .grid h3 { margin:0 0 6px; font-size:18px; }
  .grid p, .split p { margin:0; color:var(--muted); }
  ol.steps { list-style:none; padding:0; margin:0; display:grid; gap:14px; }
  ol.steps li { display:flex; gap:14px; align-items:flex-start; font-size:18px; }
  ol.steps span { flex:none; width:34px; height:34px; border-radius:50%; background:var(--a); color:#111; display:grid; place-items:center; font-weight:700; }
  .price { font:400 30px Georgia,serif; color:var(--p); margin:0 0 10px; }
  footer { padding:36px 0 48px; color:var(--muted); font-size:14px; border-top:1px solid #e7e5e4; }
  footer .host { display:block; margin-top:8px; font-size:12px; }
  footer .host a { color:inherit; }
</style>
</head>
<body>
${preview ? `<div class="bar">Private preview — only you can see this. <a href="/sauce.html#launch-${esc(launch.slug)}">Pay OFS One $99 and publish</a></div>` : ""}
<div class="wrap">
  <header class="top">${logo}<span class="brand">${esc(b.name)}</span></header>
  <div class="hero">
    <span class="chip">${esc(b.kind === "application" ? "Application" : "Website")} · for ${esc(b.audience)}</span>
    <h1>${esc(b.tagline || b.name)}</h1>
    <p>${esc(b.solution)}</p>
    <a class="cta" href="#start">${esc(b.cta || "Get started")}</a>
  </div>
  <section class="split">
    <div><span class="chip">The problem</span><h2>Everyday friction, named.</h2><p>${esc(b.problem)}</p></div>
    <div><span class="chip">How it works</span><h2>Three steps.</h2><ol class="steps">${steps}</ol></div>
  </section>
  <section>
    <span class="chip">Features</span><h2>Built for real days.</h2>
    <div class="grid">${features}</div>
  </section>
  <section id="start" class="split">
    <div><span class="chip">Pricing</span><p class="price">${esc(b.price)}</p><p>${esc(b.monetization)}</p></div>
    <div><span class="chip">Start</span><h2>${esc(b.launchKit?.headline || b.name)}</h2><p>${esc(b.launchKit?.pitch)}</p></div>
  </section>
  <footer>© ${new Date().getFullYear()} ${esc(b.name)} · ${esc(launch.fqdn)} · Launched with OFS Domains Sauce
    <small class="host">Hosted on <a href="https://www.ofsdomains.com/">OFS Domains</a> · <a href="https://www.ofsdomains.com/terms.html">Report abuse</a></small>
  </footer>
</div>
</body>
</html>`;
}
