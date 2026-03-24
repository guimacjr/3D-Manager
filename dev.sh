#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
MOBILE_DIR="$ROOT_DIR/mobile"
INSTALL_DEPS="${1:-}"

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
  echo "Nao encontrei backend/package.json em: $BACKEND_DIR" >&2
  exit 1
fi
if [[ ! -f "$MOBILE_DIR/package.json" ]]; then
  echo "Nao encontrei mobile/package.json em: $MOBILE_DIR" >&2
  exit 1
fi

if command -v ss >/dev/null 2>&1; then
  if ss -ltn 'sport = :3333' | grep -q ':3333'; then
    echo "A porta 3333 ja esta em uso. Feche o processo antigo antes de rodar o ambiente dev." >&2
    exit 1
  fi
fi

if [[ "$INSTALL_DEPS" == "--install" ]]; then
  (cd "$BACKEND_DIR" && npm install)
  (cd "$MOBILE_DIR" && npm install)
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then kill "$BACKEND_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then kill "$FRONTEND_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

echo "Iniciando backend..."
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!

sleep 2

echo "Iniciando frontend (Expo Web) em http://localhost:3333..."
(cd "$MOBILE_DIR" && EXPO_PUBLIC_API_URL="http://localhost:3333" npm run web) &
FRONTEND_PID=$!

wait
