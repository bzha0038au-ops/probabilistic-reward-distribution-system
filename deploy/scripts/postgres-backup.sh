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
  S3_BACKUP_URI                 Optional S3 prefix for readable backup copies
  S3_CROSS_REGION_URI           Optional secondary S3 prefix for manual cross-region copy
  S3_BACKUP_SSE                 Optional S3 server-side encryption mode, default: AES256
  S3_BACKUP_KMS_KEY_ID          Optional KMS key id for S3 uploads / copies
  S3_BACKUP_STORAGE_CLASS       Optional S3 storage class override

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

aws_s3_cp() {
  local source_path="$1"
  local destination_path="$2"
  local sse_mode="${S3_BACKUP_SSE:-AES256}"
  local -a cmd=(aws s3 cp --only-show-errors)

  if [[ -n "${S3_BACKUP_STORAGE_CLASS:-}" ]]; then
    cmd+=(--storage-class "${S3_BACKUP_STORAGE_CLASS}")
  fi

  if [[ -n "${S3_BACKUP_KMS_KEY_ID:-}" ]]; then
    cmd+=(--sse aws:kms --sse-kms-key-id "${S3_BACKUP_KMS_KEY_ID}")
  elif [[ -n "${sse_mode}" ]]; then
    cmd+=(--sse "${sse_mode}")
  fi

  cmd+=("${source_path}" "${destination_path}")
  "${cmd[@]}"
}

upload_artifact_to_s3() {
  local input_file="$1"
  local destination_prefix="$2"
  local destination_uri="${destination_prefix%/}/$(basename "${input_file}")"

  aws_s3_cp "${input_file}" "${destination_uri}"
  printf '%s\n' "${destination_uri}"
}

copy_artifact_to_cross_region() {
  local source_uri="$1"
  local destination_prefix="$2"
  local destination_uri="${destination_prefix%/}/$(basename "${source_uri}")"

  aws_s3_cp "${source_uri}" "${destination_uri}"
  printf '%s\n' "${destination_uri}"
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
s3_backup_uri="${S3_BACKUP_URI:-}"
s3_cross_region_uri="${S3_CROSS_REGION_URI:-}"

if [[ -n "${s3_cross_region_uri}" && -z "${s3_backup_uri}" ]]; then
  echo "S3_CROSS_REGION_URI requires S3_BACKUP_URI." >&2
  exit 1
fi

if [[ -n "${s3_backup_uri}" ]]; then
  require_cmd aws
fi

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

s3_dump_uri=""
s3_toc_uri=""
s3_checksum_uri=""
s3_metadata_uri=""
s3_cross_region_dump_uri=""
s3_cross_region_toc_uri=""
s3_cross_region_checksum_uri=""
s3_cross_region_metadata_uri=""

if [[ -n "${s3_backup_uri}" ]]; then
  s3_dump_uri="$(upload_artifact_to_s3 "${dump_file}" "${s3_backup_uri}")"
  s3_toc_uri="$(upload_artifact_to_s3 "${toc_file}" "${s3_backup_uri}")"
  s3_checksum_uri="$(upload_artifact_to_s3 "${checksum_file}" "${s3_backup_uri}")"
  s3_metadata_uri="$(upload_artifact_to_s3 "${metadata_file}" "${s3_backup_uri}")"

  if [[ -n "${s3_cross_region_uri}" ]]; then
    s3_cross_region_dump_uri="$(copy_artifact_to_cross_region "${s3_dump_uri}" "${s3_cross_region_uri}")"
    s3_cross_region_toc_uri="$(copy_artifact_to_cross_region "${s3_toc_uri}" "${s3_cross_region_uri}")"
    s3_cross_region_checksum_uri="$(copy_artifact_to_cross_region "${s3_checksum_uri}" "${s3_cross_region_uri}")"
    s3_cross_region_metadata_uri="$(copy_artifact_to_cross_region "${s3_metadata_uri}" "${s3_cross_region_uri}")"
  fi
fi

echo "Backup created: ${dump_file}"
echo "Table of contents: ${toc_file}"
echo "Checksum: ${checksum_file}"
echo "Metadata: ${metadata_file}"
if [[ -n "${s3_dump_uri}" ]]; then
  echo "S3 backup copy: ${s3_dump_uri}"
fi
if [[ -n "${s3_cross_region_dump_uri}" ]]; then
  echo "S3 cross-region copy: ${s3_cross_region_dump_uri}"
fi
echo "BACKUP_DUMP_FILE=${dump_file}"
echo "BACKUP_TOC_FILE=${toc_file}"
echo "BACKUP_CHECKSUM_FILE=${checksum_file}"
echo "BACKUP_METADATA_FILE=${metadata_file}"
echo "S3_BACKUP_DUMP_URI=${s3_dump_uri}"
echo "S3_BACKUP_TOC_URI=${s3_toc_uri}"
echo "S3_BACKUP_CHECKSUM_URI=${s3_checksum_uri}"
echo "S3_BACKUP_METADATA_URI=${s3_metadata_uri}"
echo "S3_CROSS_REGION_DUMP_URI=${s3_cross_region_dump_uri}"
echo "S3_CROSS_REGION_TOC_URI=${s3_cross_region_toc_uri}"
echo "S3_CROSS_REGION_CHECKSUM_URI=${s3_cross_region_checksum_uri}"
echo "S3_CROSS_REGION_METADATA_URI=${s3_cross_region_metadata_uri}"
