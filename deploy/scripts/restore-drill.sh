#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
restore_script="${script_dir}/postgres-restore.sh"
finance_sql="${repo_root}/deploy/sql/finance-sanity.sql"

usage() {
  cat <<'EOF'
Usage: restore-drill.sh /path/to/logical-backup-bundle.tar.gz[.enc]

Restores a logical backup bundle into an isolated target, runs validation SQL,
executes a write probe, and writes a drill report.

Configuration:
  TARGET_DATABASE_URL             Required target database
  BACKUP_ENCRYPTION_PASSPHRASE    Required when the input bundle ends with .enc
  DRILL_OUTPUT_DIR                Default: ./var/ops/restore-drills
  DRILL_ID                        Default: current UTC timestamp
  DRILL_ENVIRONMENT               Default: staging
  DRILL_RESTORE_SCOPE             Default: full-database
  DRILL_RESTORE_TARGET            Default: isolated-target
  DRILL_OPERATOR                  Default: unassigned
  DRILL_APPROVER                  Default: unassigned
  DRILL_TICKET                    Optional ticket / change id
  PRE_RESTORE_SNAPSHOT            Default: false for isolated drills
  DROP_PUBLIC_SCHEMA_BEFORE_RESTORE Default: true
  RUN_WRITE_PROBE                 true|false, default: true
  RUN_BACKEND_SMOKE               true|false, default: false
  BACKEND_START_COMMAND           Default: pnpm exec tsx apps/backend/src/server.ts
  BACKEND_SMOKE_URL               Default: http://127.0.0.1:${PORT:-4000}/health/ready

Examples:
  TARGET_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/reward_restore \
  ./deploy/scripts/restore-drill.sh /secure/backups/reward-system-logical.tar.gz.enc
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

bool_is_true() {
  case "${1:-}" in
    true|TRUE|1|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

seconds_now() {
  date -u +"%s"
}

compact_timestamp_to_iso() {
  local timestamp="$1"

  if [[ "${timestamp}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    printf '%s-%s-%sT%s:%s:%sZ' \
      "${timestamp:0:4}" \
      "${timestamp:4:2}" \
      "${timestamp:6:2}" \
      "${timestamp:9:2}" \
      "${timestamp:11:2}" \
      "${timestamp:13:2}"
    return 0
  fi

  printf '%s' "${timestamp}"
}

parse_utc_timestamp_epoch() {
  local timestamp="$1"
  local normalized_timestamp

  normalized_timestamp="$(compact_timestamp_to_iso "${timestamp}")"

  if date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "${normalized_timestamp}" +"%s" >/dev/null 2>&1; then
    date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "${normalized_timestamp}" +"%s"
    return 0
  fi

  date -u -d "${normalized_timestamp}" +"%s"
}

format_duration_human() {
  local total_seconds="$1"
  local hours minutes seconds
  local parts=()

  hours="$((total_seconds / 3600))"
  minutes="$(((total_seconds % 3600) / 60))"
  seconds="$((total_seconds % 60))"

  if (( hours > 0 )); then
    parts+=("${hours}h")
  fi

  if (( minutes > 0 )); then
    parts+=("${minutes}m")
  fi

  if (( seconds > 0 || ${#parts[@]} == 0 )); then
    parts+=("${seconds}s")
  fi

  printf '%s' "${parts[*]}"
}

extract_metadata_value() {
  local metadata_file="$1"
  local key="$2"

  awk -F': ' -v key="${key}" '$1 == key { print substr($0, index($0, ": ") + 2) }' "${metadata_file}" | tail -n 1
}

cleanup() {
  if [[ -n "${backend_pid:-}" ]]; then
    kill "${backend_pid}" >/dev/null 2>&1 || true
    wait "${backend_pid}" >/dev/null 2>&1 || true
  fi
}

decrypt_bundle_if_needed() {
  local input_file="$1"
  local output_file="$2"
  local passphrase="$3"

  if [[ "${input_file}" != *.enc ]]; then
    cp "${input_file}" "${output_file}"
    return
  fi

  if [[ -z "${passphrase}" ]]; then
    echo "BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted bundles." >&2
    exit 1
  fi

  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${input_file}" \
    -out "${output_file}" \
    -pass "pass:${passphrase}"
}

write_probe() {
  local database_url="$1"

  psql "${database_url}" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE reward_restore_drill_write_probe (
  id integer PRIMARY KEY,
  note text NOT NULL
);
INSERT INTO reward_restore_drill_write_probe (id, note)
VALUES (1, 'write probe ok');
SELECT count(*) AS probe_row_count FROM reward_restore_drill_write_probe;
ROLLBACK;
SQL
}

start_backend_smoke() {
  local smoke_command="$1"
  local smoke_url="$2"
  local log_file="$3"

  sh -lc "${smoke_command}" >"${log_file}" 2>&1 &
  backend_pid=$!

  for _ in $(seq 1 30); do
    if curl -fsS "${smoke_url}" > "${log_file}.response.json"; then
      return 0
    fi
    sleep 2
  done

  return 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

trap cleanup EXIT

input_bundle="$1"
if [[ ! -f "${input_bundle}" ]]; then
  echo "Backup bundle does not exist: ${input_bundle}" >&2
  exit 1
fi

target_database_url="${TARGET_DATABASE_URL:-}"
if [[ -z "${target_database_url}" ]]; then
  echo "TARGET_DATABASE_URL is required." >&2
  exit 1
fi

require_cmd openssl
require_cmd psql
require_cmd tar
require_cmd curl

drill_id="${DRILL_ID:-$(date -u +"%Y%m%dT%H%M%SZ")}"
drill_output_dir="${DRILL_OUTPUT_DIR:-${repo_root}/var/ops/restore-drills}"
drill_dir="${drill_output_dir}/${drill_id}"
work_dir="${drill_dir}/work"
extract_dir="${work_dir}/bundle"
report_file="${drill_dir}/restore-drill-report.md"
summary_file="${drill_dir}/restore-drill-summary.json"
backend_log_file="${drill_dir}/backend-smoke.log"
drill_environment="${DRILL_ENVIRONMENT:-staging}"
drill_restore_scope="${DRILL_RESTORE_SCOPE:-full-database}"
drill_restore_target="${DRILL_RESTORE_TARGET:-isolated-target}"
drill_operator="${DRILL_OPERATOR:-unassigned}"
drill_approver="${DRILL_APPROVER:-unassigned}"
drill_ticket="${DRILL_TICKET:-none}"
run_write_probe="${RUN_WRITE_PROBE:-true}"
run_backend_smoke="${RUN_BACKEND_SMOKE:-false}"
backend_start_command="${BACKEND_START_COMMAND:-pnpm exec tsx apps/backend/src/server.ts}"
backend_smoke_url="${BACKEND_SMOKE_URL:-http://127.0.0.1:${PORT:-4000}/health/ready}"
pre_restore_snapshot="${PRE_RESTORE_SNAPSHOT:-false}"
drop_public_schema="${DROP_PUBLIC_SCHEMA_BEFORE_RESTORE:-true}"
passphrase="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
backend_smoke_status="skipped"

mkdir -p "${extract_dir}"

decrypted_bundle="${work_dir}/logical-backup-bundle.tar.gz"
decrypt_bundle_if_needed "${input_bundle}" "${decrypted_bundle}" "${passphrase}"
tar -C "${extract_dir}" -xzf "${decrypted_bundle}"

backup_dump_file="$(find "${extract_dir}" -maxdepth 1 -type f -name '*.dump' | head -n 1)"
if [[ -z "${backup_dump_file}" ]]; then
  echo "No .dump file found in ${input_bundle}" >&2
  exit 1
fi

backup_metadata_file="$(find "${extract_dir}" -maxdepth 1 -type f -name '*.metadata.txt' | head -n 1)"
backup_created_at_utc=""
backup_created_at_epoch=""

if [[ -n "${backup_metadata_file}" ]]; then
  backup_created_at_raw="$(extract_metadata_value "${backup_metadata_file}" "backup_created_at_utc")"
  if [[ -n "${backup_created_at_raw}" ]]; then
    backup_created_at_utc="$(compact_timestamp_to_iso "${backup_created_at_raw}")"
    backup_created_at_epoch="$(parse_utc_timestamp_epoch "${backup_created_at_utc}")"
  fi
fi

if [[ -z "${backup_created_at_utc}" ]]; then
  backup_dump_basename="$(basename "${backup_dump_file}")"
  if [[ "${backup_dump_basename}" =~ ([0-9]{8}T[0-9]{6}Z) ]]; then
    backup_created_at_utc="$(compact_timestamp_to_iso "${BASH_REMATCH[1]}")"
    backup_created_at_epoch="$(parse_utc_timestamp_epoch "${backup_created_at_utc}")"
  fi
fi

drill_started_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
restore_started_epoch="$(seconds_now)"

CONFIRM_RESTORE=YES \
PRE_RESTORE_SNAPSHOT="${pre_restore_snapshot}" \
DROP_PUBLIC_SCHEMA_BEFORE_RESTORE="${drop_public_schema}" \
TARGET_DATABASE_URL="${target_database_url}" \
"${restore_script}" "${backup_dump_file}" | tee "${drill_dir}/restore.log"

restore_finished_epoch="$(seconds_now)"

psql "${target_database_url}" -v ON_ERROR_STOP=1 -f "${finance_sql}" | tee "${drill_dir}/finance-sanity.log"
restore_status="passed"
post_restore_checks_status="passed"
finance_sanity_status="passed"
write_probe_status="skipped"

if bool_is_true "${run_write_probe}"; then
  write_probe "${target_database_url}" | tee "${drill_dir}/write-probe.log"
  write_probe_status="passed"
fi

if bool_is_true "${run_backend_smoke}"; then
  if start_backend_smoke "${backend_start_command}" "${backend_smoke_url}" "${backend_log_file}"; then
    backend_smoke_status="passed"
  else
    backend_smoke_status="failed"
    echo "Backend smoke failed. See ${backend_log_file}" >&2
    exit 1
  fi
fi

drill_finished_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
drill_finished_epoch="$(seconds_now)"
restore_duration_seconds="$((restore_finished_epoch - restore_started_epoch))"
validation_duration_seconds="$((drill_finished_epoch - restore_finished_epoch))"
total_duration_seconds="$((drill_finished_epoch - restore_started_epoch))"
actual_rto_seconds="${total_duration_seconds}"
actual_rto_human="$(format_duration_human "${actual_rto_seconds}")"
estimated_rpo_seconds=""
estimated_rpo_human="unknown"

if [[ -n "${backup_created_at_epoch}" ]]; then
  estimated_rpo_seconds="$((restore_started_epoch - backup_created_at_epoch))"
  if (( estimated_rpo_seconds < 0 )); then
    estimated_rpo_seconds=0
  fi
  estimated_rpo_human="$(format_duration_human "${estimated_rpo_seconds}")"
fi

estimated_rpo_json="null"
if [[ -n "${estimated_rpo_seconds}" ]]; then
  estimated_rpo_json="${estimated_rpo_seconds}"
fi

cat > "${summary_file}" <<EOF
{
  "drill_id": "${drill_id}",
  "started_at_utc": "${drill_started_at_utc}",
  "finished_at_utc": "${drill_finished_at_utc}",
  "drill_environment": "${drill_environment}",
  "restore_scope": "${drill_restore_scope}",
  "restore_target": "${drill_restore_target}",
  "operator": "${drill_operator}",
  "approver": "${drill_approver}",
  "ticket": "${drill_ticket}",
  "input_bundle": "${input_bundle}",
  "backup_dump_file": "${backup_dump_file}",
  "backup_metadata_file": "${backup_metadata_file}",
  "backup_created_at_utc": "${backup_created_at_utc}",
  "target_database_url": "$(printf '%s' "${target_database_url}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#')",
  "estimated_rpo_seconds": ${estimated_rpo_json},
  "actual_rto_seconds": ${actual_rto_seconds},
  "restore_duration_seconds": ${restore_duration_seconds},
  "validation_duration_seconds": ${validation_duration_seconds},
  "total_duration_seconds": ${total_duration_seconds},
  "restore_status": "${restore_status}",
  "post_restore_checks": "${post_restore_checks_status}",
  "finance_sanity": "${finance_sanity_status}",
  "write_probe": "${write_probe_status}",
  "overall_status": "passed",
  "backend_smoke_status": "${backend_smoke_status}"
}
EOF

cat > "${report_file}" <<EOF
# Restore Drill Report

- Drill ID: \`${drill_id}\`
- Drill date (UTC): ${drill_started_at_utc}
- Drill environment: \`${drill_environment}\`
- Restore scope: \`${drill_restore_scope}\`
- Restore target: \`${drill_restore_target}\`
- Operator: ${drill_operator}
- Restore approver: ${drill_approver}
- Change / ticket: ${drill_ticket}
- Input backup bundle: \`${input_bundle}\`
- Restored dump: \`${backup_dump_file}\`
- Backup created (UTC): ${backup_created_at_utc:-unknown}
- Target database: \`$(printf '%s' "${target_database_url}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#')\`

## Result

- Overall status: passed
- Restore status: ${restore_status}
- \`deploy/sql/post-restore-checks.sql\`: ${post_restore_checks_status}
- Finance sanity SQL: ${finance_sanity_status}
- Write probe: ${write_probe_status}
- Backend smoke: ${backend_smoke_status}

## Timings

- Estimated RPO: $(if [[ -n "${estimated_rpo_seconds}" ]]; then printf '%ss (%s)' "${estimated_rpo_seconds}" "${estimated_rpo_human}"; else printf 'unknown'; fi)
- Actual RTO: ${actual_rto_seconds}s (${actual_rto_human})
- Restore duration: ${restore_duration_seconds}s
- Validation duration: ${validation_duration_seconds}s
- End-to-end duration: ${total_duration_seconds}s
- Drill finished (UTC): ${drill_finished_at_utc}

## Evidence Files

- Restore log: \`${drill_dir}/restore.log\`
- Finance sanity log: \`${drill_dir}/finance-sanity.log\`
- Write probe log: \`${drill_dir}/write-probe.log\`
- Backend smoke log: \`${backend_log_file}\`
- Summary JSON: \`${summary_file}\`

## Notes

- This drill restored into an isolated target.
- Estimated RPO is measured as backup age at restore start.
- Actual RTO is measured as restore plus validation wall-clock time.
- \`deploy/sql/post-restore-checks.sql\` ran through \`postgres-restore.sh\`.
- \`deploy/sql/finance-sanity.sql\` passed after restore.
- The write probe used a temporary table and rolled back.
EOF

echo "Restore drill report: ${report_file}"
echo "Restore drill summary: ${summary_file}"
echo "OPS_DRILL_DIR=${drill_dir}"
echo "OPS_DRILL_REPORT=${report_file}"
echo "OPS_DRILL_SUMMARY=${summary_file}"
