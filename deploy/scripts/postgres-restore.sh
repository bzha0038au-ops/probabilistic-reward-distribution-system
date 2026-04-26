#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
post_restore_sql="${repo_root}/deploy/sql/post-restore-checks.sql"

usage() {
  cat <<'EOF'
Usage: postgres-restore.sh /path/to/backup.dump

Restores a logical PostgreSQL backup and runs post-restore validation.

Safety controls:
  CONFIRM_RESTORE=YES                Required
  PRE_RESTORE_SNAPSHOT=true|false    Default: true
  DROP_PUBLIC_SCHEMA_BEFORE_RESTORE  Default: false

Configuration:
  TARGET_DATABASE_URL                Preferred target URL
  DATABASE_URL / POSTGRES_URL        Fallback target URL
  ENV_FILE                           Optional env file to source before reading URLs

Examples:
  CONFIRM_RESTORE=YES ENV_FILE=deploy/env/backend.env \
    ./deploy/scripts/postgres-restore.sh /secure/backups/reward.dump
EOF
}

load_env_file() {
  local env_file="${ENV_FILE:-}"
  if [[ -z "${env_file}" ]]; then
    return
  fi

  if [[ ! -f "${env_file}" ]]; then
    echo "ENV_FILE does not exist: ${env_file}" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

backup_file="$1"
if [[ ! -f "${backup_file}" ]]; then
  echo "Backup file does not exist: ${backup_file}" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "Refusing to restore without CONFIRM_RESTORE=YES." >&2
  exit 1
fi

load_env_file

require_cmd pg_restore
require_cmd psql

database_url="${TARGET_DATABASE_URL:-${DATABASE_URL:-${POSTGRES_URL:-}}}"
if [[ -z "${database_url}" ]]; then
  echo "TARGET_DATABASE_URL, DATABASE_URL, or POSTGRES_URL is required." >&2
  exit 1
fi

pre_restore_snapshot="${PRE_RESTORE_SNAPSHOT:-true}"
drop_public_schema="${DROP_PUBLIC_SCHEMA_BEFORE_RESTORE:-false}"

if [[ "${pre_restore_snapshot}" == "true" ]]; then
  require_cmd pg_dump

  snapshot_dir="${PRE_RESTORE_SNAPSHOT_DIR:-${TMPDIR:-/tmp}/reward-system-pre-restore-snapshots}"
  mkdir -p "${snapshot_dir}"

  snapshot_timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  snapshot_file="${snapshot_dir}/pre-restore-${snapshot_timestamp}.dump"

  pg_dump \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file "${snapshot_file}" \
    "${database_url}"

  echo "Pre-restore safety snapshot: ${snapshot_file}"
fi

if [[ "${drop_public_schema}" == "true" ]]; then
  psql "${database_url}" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

  pg_restore \
    --no-owner \
    --no-privileges \
    --dbname="${database_url}" \
    "${backup_file}"
else
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --single-transaction \
    --dbname="${database_url}" \
    "${backup_file}"
fi

psql "${database_url}" -v ON_ERROR_STOP=1 -f "${post_restore_sql}"

echo "Restore completed and post-restore checks passed."
