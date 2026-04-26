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

drill_started_at_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
restore_started_epoch="$(seconds_now)"

CONFIRM_RESTORE=YES \
PRE_RESTORE_SNAPSHOT="${pre_restore_snapshot}" \
DROP_PUBLIC_SCHEMA_BEFORE_RESTORE="${drop_public_schema}" \
TARGET_DATABASE_URL="${target_database_url}" \
"${restore_script}" "${backup_dump_file}" | tee "${drill_dir}/restore.log"

restore_finished_epoch="$(seconds_now)"

psql "${target_database_url}" -v ON_ERROR_STOP=1 -f "${finance_sql}" | tee "${drill_dir}/finance-sanity.log"

if bool_is_true "${run_write_probe}"; then
  write_probe "${target_database_url}" | tee "${drill_dir}/write-probe.log"
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

cat > "${summary_file}" <<EOF
{
  "drill_id": "${drill_id}",
  "started_at_utc": "${drill_started_at_utc}",
  "finished_at_utc": "${drill_finished_at_utc}",
  "operator": "${drill_operator}",
  "approver": "${drill_approver}",
  "ticket": "${drill_ticket}",
  "input_bundle": "${input_bundle}",
  "backup_dump_file": "${backup_dump_file}",
  "target_database_url": "$(printf '%s' "${target_database_url}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#')",
  "restore_duration_seconds": ${restore_duration_seconds},
  "validation_duration_seconds": ${validation_duration_seconds},
  "total_duration_seconds": ${total_duration_seconds},
  "backend_smoke_status": "${backend_smoke_status}"
}
EOF

cat > "${report_file}" <<EOF
# Restore Drill Report

- Drill ID: \`${drill_id}\`
- Drill date (UTC): ${drill_started_at_utc}
- Operator: ${drill_operator}
- Restore approver: ${drill_approver}
- Change / ticket: ${drill_ticket}
- Input backup bundle: \`${input_bundle}\`
- Restored dump: \`${backup_dump_file}\`
- Target database: \`$(printf '%s' "${target_database_url}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#')\`

## Result

- Restore status: passed
- Finance sanity SQL: passed
- Write probe: $(if bool_is_true "${run_write_probe}"; then echo "passed"; else echo "skipped"; fi)
- Backend smoke: ${backend_smoke_status}

## Timings

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
- \`deploy/sql/post-restore-checks.sql\` ran through \`postgres-restore.sh\`.
- \`deploy/sql/finance-sanity.sql\` passed after restore.
- The write probe used a temporary table and rolled back.
EOF

echo "Restore drill report: ${report_file}"
echo "Restore drill summary: ${summary_file}"
echo "OPS_DRILL_DIR=${drill_dir}"
echo "OPS_DRILL_REPORT=${report_file}"
echo "OPS_DRILL_SUMMARY=${summary_file}"
