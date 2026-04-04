#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose up -d --build "$@"

echo "Release Docker em execução:"
echo "- Web: http://localhost:8080"
echo "- API: http://localhost:3333"
