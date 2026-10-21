#!/usr/bin/env bash
# One-command setup for an OFS nameserver on a fresh Ubuntu/Debian server. Run from this folder as root:
#   ns1:  sudo ./setup.sh primary <ns2-ip>
#   ns2:  sudo ./setup.sh secondary <ns1-ip>
# Safe to run again: existing keys in .env are kept.
set -euo pipefail
cd "$(dirname "$0")"

role="${1:-}"
peer="${2:-}"
if [[ "$role" != "primary" && "$role" != "secondary" ]] || [[ -z "$peer" ]]; then
  echo "Usage: sudo ./setup.sh primary <ns2-ip>   |   sudo ./setup.sh secondary <ns1-ip>" >&2
  exit 1
fi
[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)." >&2; exit 1; }

# Docker from the distribution's own packages.
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2 openssl
  systemctl enable --now docker
fi

# DNS on both; web and API only on the primary.
if command -v ufw >/dev/null; then
  ufw allow 22/tcp
  ufw allow 53/udp
  ufw allow 53/tcp
  if [[ "$role" == "primary" ]]; then ufw allow 80/tcp; ufw allow 443/tcp; fi
  ufw --force enable
fi

# Keys are generated once and kept on later runs.
if [[ ! -f .env ]]; then
  cat > .env <<EOF
PDNS_API_KEY=$(openssl rand -hex 32)
API_HOST=dns-api.ofsdomains.com
OFS_SITE=https://www.ofsdomains.com
OFS_EDGE_KEY=$(openssl rand -hex 32)
EOF
  chmod 600 .env
fi

# Replication settings, rewritten on every run so the peer IP can change.
conf=pdns.d/ofs.conf
sed -i '/^# --- setup.sh ---$/,$d' "$conf"
echo "# --- setup.sh ---" >> "$conf"
if [[ "$role" == "primary" ]]; then
  printf 'primary=yes\nallow-axfr-ips=%s\nalso-notify=%s\n' "$peer" "$peer" >> "$conf"
  docker compose up -d
else
  printf 'secondary=yes\nautosecondary=yes\n' >> "$conf"
  docker compose up -d pdns
  sleep 5
  docker compose exec -T pdns pdnsutil add-autoprimary "$peer" ns1.ofsdomains.com || true
fi

ipv4="$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
ipv6="$(ip -6 route get 2606:4700:4700::1111 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)"

echo
echo "Done. This server ($role) is at IPv4 ${ipv4:-unknown}${ipv6:+, IPv6 $ipv6}."
if [[ "$role" == "primary" ]]; then
  # shellcheck disable=SC1091
  source .env
  cat <<EOF

Next, in Netlify (Domains -> ofsdomains.com -> DNS records), add:
  ns1      A  ${ipv4}
  dns-api  A  ${ipv4}
  (and ns2 A <ns2-ip> once ns2 is set up)

Then in Netlify (Project configuration -> Environment variables), add:
  POWERDNS_API_URL   https://dns-api.ofsdomains.com
  POWERDNS_API_KEY   ${PDNS_API_KEY}
  OFS_EDGE_KEY       ${OFS_EDGE_KEY}
  OFS_HOSTING_IPV4   ${ipv4}
${ipv6:+  OFS_HOSTING_IPV6   ${ipv6}
}
Keep these keys private. They are also saved in $(pwd)/.env.
EOF
fi
