#!/usr/bin/env bash
# 약관 웹페이지를 서버에 올린다.
#
# 본문은 app-client/src/legal/content.ts 한 곳에만 있고, HTML 은 거기서
# 생성한다(app-client/scripts/build-legal-html.mjs). 내용을 고쳤으면
# `npm run build:legal` 로 다시 만든 뒤 이걸 돌린다 — 잊어도 테스트가 잡는다.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
WEB="$HERE/../web"

[ -f "$WEB/privacy.html" ] || { echo "$WEB 에 생성물이 없다. npm run build:legal 먼저."; exit 1; }

PAYLOAD=$(cd "$WEB" && tar -czf - . | base64)
"$HERE/ssm.sh" <<SCRIPT
set -e
mkdir -p /var/www/studylog
echo '$PAYLOAD' | base64 -d | tar -xzf - -C /var/www/studylog
chown -R www-data:www-data /var/www/studylog
ls /var/www/studylog/
SCRIPT
