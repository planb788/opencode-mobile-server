#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/opencode-mobile-server}"
ENV_DIR="/etc/opencode-mobile-server"
DOMAIN="${1:-}"

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Node.js 18 or newer is required." >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root or with sudo: sudo bash scripts/install-linux.sh example.com" >&2
  exit 1
fi

install -d "${INSTALL_DIR}" "${ENV_DIR}"
if [[ "${ROOT}" != "${INSTALL_DIR}" ]]; then
  cp -a "${ROOT}/." "${INSTALL_DIR}/"
fi

if [[ ! -f "${ENV_DIR}/opencode.env" ]]; then
  if [[ -f "${ROOT}/.env" ]]; then
    install -m 600 "${ROOT}/.env" "${ENV_DIR}/opencode.env"
  else
    install -m 600 "${ROOT}/.env.example" "${ENV_DIR}/opencode.env"
    echo "Created ${ENV_DIR}/opencode.env. Change the password before exposing the service."
  fi
fi

sed \
  -e "s|__INSTALL_DIR__|${INSTALL_DIR}|g" \
  -e "s|__NODE_BIN__|${NODE_BIN}|g" \
  "${ROOT}/scripts/opencode-mobile-server.service" > /etc/systemd/system/opencode-mobile-server.service
systemctl daemon-reload
systemctl enable --now opencode-mobile-server.service

if [[ -n "${DOMAIN}" ]]; then
  safe_domain="${DOMAIN//[^A-Za-z0-9_.-]/_}"
  sed "s|__DOMAIN__|${DOMAIN}|g" "${ROOT}/scripts/nginx-opencode-mobile-server.conf.example" > "/etc/nginx/conf.d/opencode-mobile-server-${safe_domain}.conf"
  echo "Generated Nginx config: /etc/nginx/conf.d/opencode-mobile-server-${safe_domain}.conf"
  echo "Run nginx -t && systemctl reload nginx after reviewing it."
fi

echo "OpenCode Mobile Server is running on 127.0.0.1:8787/opencode/"
echo "Configure the OpenCode API service with scripts/opencode-server.service if needed."
