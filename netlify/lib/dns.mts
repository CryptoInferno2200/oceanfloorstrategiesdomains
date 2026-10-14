// OFS's own authoritative DNS: a self-hosted PowerDNS server (see server/powerdns). No third-party DNS host.
// POWERDNS_API_URL is the server's HTTPS API base, POWERDNS_API_KEY its key, OFS_NAMESERVERS a comma list
// such as "ns1.ofsdomains.com,ns2.ofsdomains.com", and OFS_HOSTING_IPV4 (optional OFS_HOSTING_IPV6) where names point.

const env = (name: string) => String(Netlify.env.get(name) || "").trim();

export const nameservers = () => env("OFS_NAMESERVERS").split(",").map((ns) => ns.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);

export const dnsConfigured = () => Boolean(env("POWERDNS_API_URL") && env("POWERDNS_API_KEY") && env("OFS_HOSTING_IPV4") && nameservers().length >= 2);

async function pdns(method: string, path: string, body?: unknown) {
  const response = await fetch(`${env("POWERDNS_API_URL").replace(/\/$/, "")}/api/v1/servers/localhost${path}`, {
    method,
    headers: { "X-API-Key": env("POWERDNS_API_KEY"), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 409) {
    const detail = await response.text().catch(() => "");
    throw new Error(`PowerDNS ${method} ${path.split("?")[0]} returned ${response.status}: ${detail.slice(0, 200)}`);
  }
  return response.status;
}

// Creates (or refreshes) the zone: apex at OFS hosting, www following the apex, CAA for Let's Encrypt.
export async function provisionZone(fqdn: string) {
  const zone = `${fqdn}.`;
  const ttl = 3600;
  const rrset = (name: string, type: string, contents: string[]) => ({
    name, type, ttl, changetype: "REPLACE", records: contents.map((content) => ({ content, disabled: false })),
  });
  const rrsets = [
    rrset(zone, "A", [env("OFS_HOSTING_IPV4")]),
    rrset(`www.${zone}`, "CNAME", [zone]),
    rrset(zone, "CAA", ['0 issue "letsencrypt.org"', '0 issuewild "letsencrypt.org"']),
  ];
  if (env("OFS_HOSTING_IPV6")) rrsets.push(rrset(zone, "AAAA", [env("OFS_HOSTING_IPV6")]));
  const created = await pdns("POST", "/zones", {
    name: zone,
    kind: "Native",
    nameservers: nameservers().map((ns) => `${ns}.`),
    rrsets: rrsets.map(({ changetype, ...set }) => set),
  });
  // 409: the zone already exists from an earlier attempt, so bring its records up to date instead.
  if (created === 409) await pdns("PATCH", `/zones/${encodeURIComponent(zone)}`, { rrsets });
}
