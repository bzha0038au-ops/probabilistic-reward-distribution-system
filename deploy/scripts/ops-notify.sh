#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ops-notify.sh <severity> <title> [body]

Posts a backup / restore alert to a webhook endpoint.

Configuration:
  ALERT_WEBHOOK_URL      Required
  ALERT_WEBHOOK_FORMAT   slack|generic, default: slack
  ALERT_RUNBOOK_URL      Optional; if set, sent as the first message line
  ALERT_SOURCE           Optional source label
EOF
}

json_escape() {
  printf '%s' "${1}" | awk '
    BEGIN { ORS = "" }
    {
      gsub(/\\/, "\\\\");
      gsub(/"/, "\\\"");
      if (NR > 1) {
        printf "\\n";
      }
      printf "%s", $0;
    }
  '
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

severity="$1"
title="$2"
body="${3:-}"
webhook_url="${ALERT_WEBHOOK_URL:-}"
webhook_format="${ALERT_WEBHOOK_FORMAT:-slack}"
runbook_url="${ALERT_RUNBOOK_URL:-}"
alert_source="${ALERT_SOURCE:-reward-system-ops}"

if [[ -z "${webhook_url}" ]]; then
  echo "ALERT_WEBHOOK_URL is required." >&2
  exit 1
fi

formatted_message="[$severity] $title"
if [[ -n "${runbook_url}" ]]; then
  formatted_message="${runbook_url}"$'\n'"${formatted_message}"
fi
if [[ -n "${body}" ]]; then
  formatted_message="${formatted_message}"$'\n'"${body}"
fi
formatted_message="${formatted_message}"$'\n'"source=${alert_source}"

case "${webhook_format}" in
  slack)
    payload="$(cat <<EOF
{"text":"$(json_escape "${formatted_message}")"}
EOF
)"
    ;;
  generic)
    payload="$(cat <<EOF
{"severity":"$(json_escape "${severity}")","title":"$(json_escape "${title}")","body":"$(json_escape "${formatted_message}")","runbook_url":"$(json_escape "${runbook_url}")","source":"$(json_escape "${alert_source}")"}
EOF
)"
    ;;
  *)
    echo "Unsupported ALERT_WEBHOOK_FORMAT: ${webhook_format}" >&2
    exit 1
    ;;
esac

curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  --data "${payload}" \
  "${webhook_url}" >/dev/null
