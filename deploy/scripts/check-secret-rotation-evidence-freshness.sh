#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: check-secret-rotation-evidence-freshness.sh [evidence-dir] [max-age-days]

Checks the newest committed secret-rotation evidence summary and fails when it
is older than the allowed age.

Defaults:
  evidence-dir  docs/operations/evidence
  max-age-days  90

Supported timestamp fields inside *.summary.json:
  - completed_at_utc
  - finished_at_utc
  - performed_at_utc
  - date
EOF
}

format_epoch_utc() {
  local epoch="$1"

  if date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
    return
  fi

  date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
}

parse_timestamp_epoch() {
  local timestamp="$1"

  if [[ "${timestamp}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    timestamp="${timestamp}T00:00:00Z"
  fi

  if date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "${timestamp}" +"%s" >/dev/null 2>&1; then
    date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "${timestamp}" +"%s"
    return
  fi

  date -u -d "${timestamp}" +"%s"
}

emit_output() {
  local latest_file="${1:-}"
  local latest_recorded_epoch="${2:-}"
  local latest_recorded_utc="${3:-}"
  local latest_age_days="${4:-}"
  local max_age_days="${5:-}"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "latest_file=${latest_file}"
      echo "latest_recorded_epoch=${latest_recorded_epoch}"
      echo "latest_recorded_utc=${latest_recorded_utc}"
      echo "latest_age_days=${latest_age_days}"
      echo "max_age_days=${max_age_days}"
    } >> "${GITHUB_OUTPUT}"
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

evidence_dir="${1:-docs/operations/evidence}"
max_age_days="${2:-90}"

if [[ ! -d "${evidence_dir}" ]]; then
  emit_output "" "" "" "" "${max_age_days}"
  echo "Evidence directory does not exist: ${evidence_dir}" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  emit_output "" "" "" "" "${max_age_days}"
  echo "Missing required command: jq" >&2
  exit 1
fi

latest_file=""
latest_recorded_epoch=""
latest_recorded_utc=""

while IFS= read -r candidate; do
  [[ -n "${candidate}" ]] || continue

  recorded_utc="$(jq -r '
    .completed_at_utc //
    .finished_at_utc //
    .performed_at_utc //
    .date //
    empty
  ' "${candidate}")"

  if [[ -z "${recorded_utc}" || "${recorded_utc}" == "null" ]]; then
    continue
  fi

  recorded_epoch="$(parse_timestamp_epoch "${recorded_utc}")"

  if [[ -z "${latest_file}" || "${recorded_epoch}" -gt "${latest_recorded_epoch}" ]]; then
    latest_file="${candidate}"
    latest_recorded_epoch="${recorded_epoch}"
    latest_recorded_utc="$(format_epoch_utc "${recorded_epoch}")"
  fi
done < <(find "${evidence_dir}" -maxdepth 1 -type f -name 'secret-rotation-*.summary.json' | sort)

if [[ -z "${latest_file}" ]]; then
  emit_output "" "" "" "" "${max_age_days}"
  echo "No secret rotation evidence summaries found in ${evidence_dir}" >&2
  exit 1
fi

now_epoch="$(date +%s)"
latest_age_days="$(((now_epoch - latest_recorded_epoch) / 86400))"

emit_output "${latest_file}" "${latest_recorded_epoch}" "${latest_recorded_utc}" "${latest_age_days}" "${max_age_days}"

echo "Latest secret rotation evidence: ${latest_file}"
echo "Latest secret rotation record (UTC): ${latest_recorded_utc}"
echo "Latest secret rotation age (days): ${latest_age_days}"
echo "Allowed max age (days): ${max_age_days}"

if (( latest_age_days > max_age_days )); then
  echo "Secret rotation evidence is older than ${max_age_days} days." >&2
  exit 1
fi
