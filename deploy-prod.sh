#!/usr/bin/env bash
# Prod-Deploy für productfinder.oneal.arkturian.com
#
# WICHTIG: .env setzt VITE_BASE_PATH=/productfinder/ für den DEV-Server
# (vite auf :5173 hinter productfinder-dev vhost). Prod-nginx serviert die
# SPA unter / — der Build MUSS deshalb mit Base / laufen, sonst laufen
# alle Asset-Requests in den SPA-Fallback (MIME text/html, weiße Seite).
set -euo pipefail
cd "$(dirname "$0")"

VITE_BASE_PATH=/ npm run build

if ! grep -q 'src="/assets/index-' dist/index.html; then
  echo "FEHLER: dist/index.html referenziert nicht /assets/ — Base-Path falsch" >&2
  exit 1
fi

cp -r dist/* /var/www/productfinder/site/
echo "Deployed: $(grep -o 'index-[^"]*\.js' dist/index.html | head -1)"
