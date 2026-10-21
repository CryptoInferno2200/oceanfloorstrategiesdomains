import type { Config } from "@netlify/functions";
import { PAGE_HEADERS, page } from "../lib/sauce-page.mts";
import { businessPage, lookupName, normalizeHost, parkedPage } from "../lib/hosting.mts";

// Called only by the OFS web edge (server/powerdns/Caddyfile), never by browsers.
// /api/hosting/allow?domain=  Caddy's on-demand TLS check: 200 lets it get a certificate for the name, anything else refuses.
// /api/hosting/render?host=&path=  the page for a customer name. Needs the shared OFS_EDGE_KEY so pages only appear on their own names.
const text = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });

// Browsers may cache briefly; Netlify's CDN must not, or a cached page could skip the key check.
const EDGE = { "Netlify-CDN-Cache-Control": "no-store" };

const apexOf = (host: string) => (host.startsWith("www.") ? host.slice(4) : host);

export default async (request: Request) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/hosting/allow") {
    const host = normalizeHost(url.searchParams.get("domain"));
    const found = await lookupName(apexOf(host));
    return text(found ? "ok" : "unknown name", found ? 200 : 404);
  }

  const key = String(Netlify.env.get("OFS_EDGE_KEY") || "");
  if (!key || request.headers.get("x-ofs-edge-key") !== key) return text("Not found", 404);

  const host = normalizeHost(url.searchParams.get("host"));
  const path = String(url.searchParams.get("path") || "/");
  const apex = apexOf(host);
  const found = await lookupName(apex);
  if (!found) return text("This name is not hosted here.", 404);
  // One address per site: www always forwards to the bare name.
  if (host !== apex) return new Response(null, { status: 301, headers: { ...EDGE, Location: `https://${apex}${path.startsWith("/") ? path : "/"}` } });
  if (path === "/robots.txt") return text(found.kind === "parked" ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n", 200, { ...EDGE, "Cache-Control": "public, max-age=300" });
  // Every site is one page, so other paths go home.
  if (path !== "/") return new Response(null, { status: 302, headers: { ...EDGE, Location: "/", "Cache-Control": "public, max-age=300" } });

  const html = found.kind === "sauce" ? page(found.launch, false) : found.kind === "business" ? businessPage(found.site) : parkedPage(found.fqdn);
  return new Response(html, { headers: { ...PAGE_HEADERS, ...EDGE, "Cache-Control": "public, max-age=60" } });
};

export const config: Config = { path: ["/api/hosting/allow", "/api/hosting/render"] };
