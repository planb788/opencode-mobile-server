#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/opencode-mobile-server}"
ENV_DIR="/etc/opencode-mobile-server"
DOMAIN=""
SKIP_NGINX=0

usage() {
  echo "Usage: sudo bash scripts/deploy-linux.sh [domain] [--skip-nginx]"
  echo "Example: sudo bash scripts/deploy-linux.sh example.com"
}

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      usage
      exit 0
      ;;
    --skip-nginx)
      SKIP_NGINX=1
      ;;
    --domain=*)
      DOMAIN="${arg#*=}"
      ;;
    -*)
      usage
      exit 1
      ;;
    *)
      if [[ -n "${DOMAIN}" ]]; then
        usage
        exit 1
      fi
      DOMAIN="$arg"
      ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root or with sudo: sudo bash scripts/deploy-linux.sh example.com" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode || true)}"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Node.js 18 or newer is required." >&2
  exit 1
fi
if [[ -z "${OPENCODE_BIN}" ]]; then
  echo "The opencode command was not found. Install OpenCode or set OPENCODE_BIN=/path/to/opencode." >&2
  exit 1
fi

if [[ -n "${DOMAIN}" && "${SKIP_NGINX}" -eq 0 && ! -x "$(command -v nginx || true)" ]]; then
  echo "Nginx is required when a domain is provided. Use --skip-nginx to deploy the services only." >&2
  exit 1
fi

install -d "${INSTALL_DIR}" "${ENV_DIR}"
if [[ "${ROOT}" != "${INSTALL_DIR}" ]]; then
  cp -a "${ROOT}/." "${INSTALL_DIR}/"
fi

ENV_FILE="${ENV_DIR}/opencode.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${ROOT}/.env" ]]; then
    install -m 600 "${ROOT}/.env" "${ENV_FILE}"
  else
    install -m 600 "${ROOT}/.env.example" "${ENV_FILE}"
    echo "Created ${ENV_FILE} with the default password: opencode"
    echo "Change it before exposing the service to the Internet."
  fi
else
  chmod 600 "${ENV_FILE}"
fi

sed \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__NODE_BIN__|${NODE_BIN}|g" \
  "${ROOT}/scripts/opencode-mobile-server.service" > /etc/systemd/system/opencode-mobile-server.service

sed \
  -e "s|/usr/local/bin/opencode|${OPENCODE_BIN}|g" \
  "${ROOT}/scripts/opencode-server.service" > /etc/systemd/system/opencode-server.service

NGINX_CONFIG=""
if [[ -n "${DOMAIN}" && "${SKIP_NGINX}" -eq 0 ]]; then
  safe_domain="${DOMAIN//[^A-Za-z0-9_.-]/_}"
  NGINX_CONFIG="/etc/nginx/conf.d/opencode-mobile-server-${safe_domain}.conf"
  sed "s|__DOMAIN__|${DOMAIN}|g" "${ROOT}/scripts/nginx-opencode-mobile-server.conf.example" > "${NGINX_CONFIG}"
fi

systemctl daemon-reload
systemctl enable --now opencode-server.service
systemctl enable --now opencode-mobile-server.service

if [[ -n "${NGINX_CONFIG}" ]]; then
  nginx -t
  systemctl reload nginx
fi

for attempt in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:8787/opencode/" >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 5 ]]; then
    echo "The web gateway did not become ready. Check: systemctl status opencode-mobile-server.service" >&2
    exit 1
  fi
  sleep 1
done

echo "OpenCode Mobile Server deployment completed."
echo "Local URL: http://127.0.0.1:8787/opencode/"
if [[ -n "${DOMAIN}" ]]; then
  echo "Public URL: http://${DOMAIN}/opencode/"
fi
echo "Password file: ${ENV_FILE}"
