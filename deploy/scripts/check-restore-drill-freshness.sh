#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: check-restore-drill-freshness.sh [evidence-dir] [max-age-days]

Checks the newest committed restore-drill markdown file by mtime and fails when
it is older than the allowed age.

Defaults:
  evidence-dir  docs/operations/evidence
  max-age-days  90
EOF
}

file_mtime_epoch() {
  local path="$1"

  if stat -f '%m' "${path}" >/dev/null 2>&1; then
    stat -f '%m' "${path}"
    return
  fi

  stat -c '%Y' "${path}"
}

format_epoch_utc() {
  local epoch="$1"

  if date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ" >/dev/null 2>&1; then
    date -u -r "${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
    return
  fi

  date -u -d "@${epoch}" +"%Y-%m-%dT%H:%M:%SZ"
}

emit_output() {
  local latest_file="${1:-}"
  local latest_mtime_epoch="${2:-}"
  local latest_mtime_utc="${3:-}"
  local latest_age_days="${4:-}"
  local max_age_days="${5:-}"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    {
      echo "latest_file=${latest_file}"
      echo "latest_mtime_epoch=${latest_mtime_epoch}"
      echo "latest_mtime_utc=${latest_mtime_utc}"
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

latest_file=""
latest_mtime_epoch=""

while IFS= read -r candidate; do
  [[ -n "${candidate}" ]] || continue

  candidate_mtime_epoch="$(file_mtime_epoch "${candidate}")"
  if [[ -z "${latest_file}" || "${candidate_mtime_epoch}" -gt "${latest_mtime_epoch}" ]]; then
    latest_file="${candidate}"
    latest_mtime_epoch="${candidate_mtime_epoch}"
  fi
done < <(find "${evidence_dir}" -maxdepth 1 -type f -name 'restore-drill-*.md' | sort)

if [[ -z "${latest_file}" ]]; then
  emit_output "" "" "" "" "${max_age_days}"
  echo "No restore drill evidence markdown files found in ${evidence_dir}" >&2
  exit 1
fi

now_epoch="$(date +%s)"
latest_age_days="$(((now_epoch - latest_mtime_epoch) / 86400))"
latest_mtime_utc="$(format_epoch_utc "${latest_mtime_epoch}")"

emit_output "${latest_file}" "${latest_mtime_epoch}" "${latest_mtime_utc}" "${latest_age_days}" "${max_age_days}"

echo "Latest restore drill evidence: ${latest_file}"
echo "Latest restore drill mtime (UTC): ${latest_mtime_utc}"
echo "Latest restore drill age (days): ${latest_age_days}"
echo "Allowed max age (days): ${max_age_days}"

if (( latest_age_days > max_age_days )); then
  echo "Restore drill evidence is older than ${max_age_days} days." >&2
  exit 1
fi
