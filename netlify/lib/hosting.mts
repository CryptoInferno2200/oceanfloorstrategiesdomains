// Customer names served by the OFS web edge (server/powerdns/Caddyfile): which names it may serve and what each one shows.
// A published Sauce launch wins, then a business site from the Claim name page, then a holding page for any registered name.
import { getDatabase } from "@netlify/database";
import { esc } from "./sauce-page.mts";

export const normalizeHost = (value: unknown) => String(value || "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
export const validDomain = (value: string) => /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);

export type HostedName =
  | { kind: "sauce"; launch: Record<string, any> }
  | { kind: "business"; site: Record<string, any> }
  | { kind: "parked"; fqdn: string };

export async function lookupName(fqdn: string): Promise<HostedName | null> {
  if (!validDomain(fqdn)) return null;
  const db = getDatabase();
  const [launch] = await db.sql`SELECT slug, fqdn, brief, logo_key, status FROM sauce_launches WHERE fqdn = ${fqdn} AND status = 'published' LIMIT 1`;
  if (launch) return { kind: "sauce", launch };
  const [site] = await db.sql`SELECT * FROM hosted_sites WHERE fqdn = ${fqdn} AND published`;
  if (site) return { kind: "business", site };
  const [registered] = await db.sql`SELECT fqdn FROM domain_registrations WHERE fqdn = ${fqdn} AND status = 'registered' LIMIT 1`;
  if (registered) return { kind: "parked", fqdn };
  return null;
}

const STYLE = `
  :root { --ink:#0f172a; --muted:#475569; --bg:#fbfaf7; --p:#0f766e; }
  * { box-sizing:border-box; }
  body { margin:0; font:17px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:880px; margin:0 auto; padding:0 24px; min-height:100vh; display:flex; flex-direction:column; }
  header { padding:24px 0; font-weight:700; font-size:20px; }
  main { flex:1; padding:48px 0 72px; display:grid; gap:20px; align-content:start; }
  h1 { font:400 clamp(40px,7vw,72px)/1.04 Georgia,serif; letter-spacing:-.03em; margin:0; }
  .lead { font-size:21px; color:var(--muted); margin:0; max-width:60ch; }
  .about { white-space:pre-line; margin:0; max-width:65ch; }
  ul.contact { list-style:none; padding:0; margin:12px 0 0; display:flex; flex-wrap:wrap; gap:10px; }
  ul.contact a, ul.contact span { display:inline-block; padding:10px 18px; border-radius:999px; background:#fff; color:var(--ink); text-decoration:none; box-shadow:0 0 0 1px #e7e5e4; }
  ul.contact a.primary { background:var(--p); color:#fff; box-shadow:none; }
  footer { padding:28px 0 40px; color:var(--muted); font-size:13px; border-top:1px solid #e7e5e4; }
  footer a { color:inherit; }
`;

function shell(title: string, description: string, body: string, fqdn: string, noindex = false) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="https://${esc(fqdn)}/" />
${noindex ? '<meta name="robots" content="noindex" />' : ""}
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
${body}
  <footer>© ${new Date().getFullYear()} ${esc(fqdn)} · Hosted on <a href="https://www.ofsdomains.com/">OFS Domains</a> · <a href="https://www.ofsdomains.com/terms.html">Report abuse</a></footer>
</div>
</body>
</html>`;
}

export function businessPage(site: Record<string, any>) {
  const contact = [
    site.contact_email ? `<li><a class="primary" href="mailto:${esc(site.contact_email)}">Email ${esc(site.contact_email)}</a></li>` : "",
    site.phone ? `<li><a href="tel:${esc(String(site.phone).replace(/[^0-9+]/g, ""))}">Call ${esc(site.phone)}</a></li>` : "",
    site.location ? `<li><span>${esc(site.location)}</span></li>` : "",
  ].join("");
  return shell(
    site.tagline ? `${site.business_name} — ${site.tagline}` : site.business_name,
    site.tagline || String(site.description || "").slice(0, 160),
    `  <header>${esc(site.business_name)}</header>
  <main>
    <h1>${esc(site.tagline || site.business_name)}</h1>
    ${site.description ? `<p class="about">${esc(site.description)}</p>` : ""}
    ${contact ? `<ul class="contact">${contact}</ul>` : ""}
  </main>`,
    site.fqdn,
  );
}

export function parkedPage(fqdn: string) {
  return shell(
    fqdn,
    `${fqdn} is registered and coming soon.`,
    `  <header>${esc(fqdn)}</header>
  <main>
    <h1>Coming soon.</h1>
    <p class="lead">${esc(fqdn)} is registered and its site is on the way.</p>
  </main>`,
    fqdn,
    true,
  );
}
