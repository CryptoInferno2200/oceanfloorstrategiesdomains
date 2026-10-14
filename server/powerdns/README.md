# OFS DNS — self-hosted PowerDNS

Every customer name sold on OFS Domains is served by these nameservers, not a third-party DNS host.
After a name is registered, the site creates its zone here through the PowerDNS API and then sets the
name's nameservers at Porkbun to `ns1.ofsdomains.com` / `ns2.ofsdomains.com`.

## 1. Servers

Registries expect at least two nameservers, ideally on different networks. Rent two small Linux VPSes
(1 vCPU / 1 GB is plenty) from two providers or regions, each with a static IPv4 (and IPv6 if available).

On both, install Docker, then open these ports in the firewall: **53/udp, 53/tcp** (DNS) and on the
primary only **80, 443** (API TLS). Nothing else.

## 2. Primary (ns1)

```sh
cp .env.example .env      # set a long random PDNS_API_KEY and API_HOST
docker compose up -d
```

In `pdns.d/ofs.conf` on ns1, uncomment `primary=yes`, `allow-axfr-ips` and `also-notify` with ns2's IP.

## 3. Secondary (ns2)

Run only the `pdns` service (`docker compose up -d pdns`) and set in `pdns.d/ofs.conf`:

```
secondary=yes
autosecondary=yes
```

Then register ns1 as an autoprimary on ns2:
`docker compose exec pdns pdnsutil add-autoprimary <ns1-ip> ns1.ofsdomains.com`.
Zones created on ns1 now copy to ns2 automatically.

## 4. Nameserver names

In the ofsdomains.com DNS zone, add:

```
ns1          A  <ns1-ip>
ns2          A  <ns2-ip>
dns-api      A  <ns1-ip>
```

Because these hostnames live under ofsdomains.com and customer names are other domains, no glue
records are needed at the registry for customer names.

## 5. Connect the site

Set these environment variables on the site (Project configuration → Environment variables):

| Name | Value |
| --- | --- |
| `POWERDNS_API_URL` | `https://dns-api.ofsdomains.com` |
| `POWERDNS_API_KEY` | the `PDNS_API_KEY` from `.env` |
| `OFS_NAMESERVERS` | `ns1.ofsdomains.com,ns2.ofsdomains.com` |
| `OFS_HOSTING_IPV4` | IPv4 of the web server that hosts customer sites |
| `OFS_HOSTING_IPV6` | optional IPv6 of that server |

Until all required values are set, registered names wait in a "pending" DNS state; the 15-minute
retry schedule picks them up as soon as the server is connected, including names registered earlier.

## 6. Check

```sh
dig @<ns1-ip> example.com A +short
dig @<ns2-ip> example.com SOA +short
```

Back up the `pdns-data` volume on ns1 regularly; ns2 holds a live copy of every zone.
