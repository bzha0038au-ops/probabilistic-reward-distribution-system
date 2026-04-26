#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: postgres-backup.sh [backup-prefix]

Creates a logical PostgreSQL backup for the reward-system database.

Configuration:
  DATABASE_URL / POSTGRES_URL   Required unless ENV_FILE is provided
  ENV_FILE                      Optional env file to source before reading URLs
  BACKUP_DIR                    Optional output directory
  BACKUP_PREFIX                 Optional filename prefix when no positional arg is passed
  BACKUP_TIMESTAMP              Optional UTC timestamp override (YYYYMMDDTHHMMSSZ)

Examples:
  ENV_FILE=deploy/env/backend.env ./deploy/scripts/postgres-backup.sh
  DATABASE_URL=postgres://... ./deploy/scripts/postgres-backup.sh reward-prod
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

write_checksum() {
  local input_file="$1"
  local output_file="$2"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${input_file}" > "${output_file}"
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${input_file}" > "${output_file}"
    return
  fi

  echo "Missing checksum tool: expected shasum or sha256sum" >&2
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

load_env_file

require_cmd pg_dump
require_cmd pg_restore

database_url="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -z "${database_url}" ]]; then
  echo "DATABASE_URL or POSTGRES_URL is required." >&2
  exit 1
fi

timestamp="${BACKUP_TIMESTAMP:-$(date -u +"%Y%m%dT%H%M%SZ")}"
default_backup_dir="${TMPDIR:-/tmp}/reward-system-backups"
backup_dir="${BACKUP_DIR:-${default_backup_dir}}"
backup_prefix="${1:-${BACKUP_PREFIX:-reward-system}}"

mkdir -p "${backup_dir}"

backup_base="${backup_dir}/${backup_prefix}-${timestamp}"
dump_file="${backup_base}.dump"
toc_file="${backup_base}.toc"
checksum_file="${dump_file}.sha256"
metadata_file="${backup_base}.metadata.txt"

redacted_database_url="$(printf '%s' "${database_url}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#')"
git_commit="$(git -C "${repo_root}" rev-parse HEAD 2>/dev/null || printf 'unknown')"
git_branch="$(git -C "${repo_root}" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"

pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file "${dump_file}" \
  "${database_url}"

pg_restore --list "${dump_file}" > "${toc_file}"
write_checksum "${dump_file}" "${checksum_file}"

cat > "${metadata_file}" <<EOF
backup_created_at_utc: ${timestamp}
backup_file: ${dump_file}
backup_toc_file: ${toc_file}
backup_checksum_file: ${checksum_file}
source_database_url: ${redacted_database_url}
source_git_commit: ${git_commit}
source_git_branch: ${git_branch}
pg_dump_version: $(pg_dump --version)
EOF

echo "Backup created: ${dump_file}"
echo "Table of contents: ${toc_file}"
echo "Checksum: ${checksum_file}"
echo "Metadata: ${metadata_file}"
echo "BACKUP_DUMP_FILE=${dump_file}"
echo "BACKUP_TOC_FILE=${toc_file}"
echo "BACKUP_CHECKSUM_FILE=${checksum_file}"
echo "BACKUP_METADATA_FILE=${metadata_file}"
