#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: telegram-notify.sh <chat_id> <message>

Configuration:
  DEPLOY_TG_BOT_TOKEN   Required Telegram bot token
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Missing required command: curl" >&2
  exit 1
fi

chat_id="$1"
message="$2"
bot_token="${DEPLOY_TG_BOT_TOKEN:-}"

if [[ -z "${bot_token}" ]]; then
  echo "DEPLOY_TG_BOT_TOKEN is required." >&2
  exit 1
fi

curl -fsS -X POST \
  "https://api.telegram.org/bot${bot_token}/sendMessage" \
  --data-urlencode "chat_id=${chat_id}" \
  --data-urlencode "text=${message}" \
  --data-urlencode "disable_web_page_preview=true" >/dev/null
