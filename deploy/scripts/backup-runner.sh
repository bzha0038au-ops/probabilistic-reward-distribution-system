#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: backup-runner.sh

Creates a scheduled operations backup run:
  - logical PostgreSQL dump
  - optional PostgreSQL volume archive
  - encrypted bundles for offsite storage
  - local retention pruning

Configuration:
  ENV_FILE                        Optional backend env file
  COMPOSE_ENV_FILE                Optional compose env file for COMPOSE_PROJECT_NAME
  BACKUP_PREFIX                   Default: reward-system
  BACKUP_ROOT                     Default: ./var/ops/backups under the repo or deploy path
  INCLUDE_VOLUME_BACKUP           true|false, default: true
  DATABASE_VOLUME_NAME            Optional explicit Docker volume name
  BACKUP_ENCRYPTION_PASSPHRASE    Required for encrypted bundles
  OFFSITE_STORAGE_URI             Optional: s3://..., ssh://user@host/path, /path, file:///path
  LOCAL_RETENTION_DAYS            Default: 35
  OFFSITE_RETENTION_DAYS          Default: 90 (best-effort for local/ssh, advisory for s3)
  KEEP_LOCAL_PLAINTEXT            true|false, default: false

Examples:
  ENV_FILE=deploy/env/backend.env \
  BACKUP_ENCRYPTION_PASSPHRASE=change-me \
  ./deploy/scripts/backup-runner.sh

  ENV_FILE=deploy/env/backend.env \
  COMPOSE_ENV_FILE=deploy/env/compose.env \
  OFFSITE_STORAGE_URI=s3://reward-dr/reward-system \
  BACKUP_ENCRYPTION_PASSPHRASE=change-me \
  INCLUDE_VOLUME_BACKUP=true \
  ./deploy/scripts/backup-runner.sh
EOF
}

load_env_file() {
  local env_file="$1"
  if [[ -z "${env_file}" ]]; then
    return
  fi

  if [[ ! -f "${env_file}" ]]; then
    echo "Env file does not exist: ${env_file}" >&2
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

redact_database_url() {
  printf '%s' "${1}" | sed -E 's#(postgres(ql)?://)[^@/]+@#\1***:***@#'
}

extract_output_value() {
  local output="$1"
  local key="$2"

  printf '%s\n' "${output}" | awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1) }' | tail -n 1
}

resolve_volume_name() {
  local configured_name="${DATABASE_VOLUME_NAME:-}"
  local compose_project_name="${COMPOSE_PROJECT_NAME:-}"
  local candidate=""

  if [[ -n "${configured_name}" ]]; then
    echo "${configured_name}"
    return
  fi

  for candidate in \
    "${compose_project_name}_reward_postgres_data" \
    "${compose_project_name}-reward_postgres_data" \
    "reward_postgres_data"
  do
    if [[ -n "${candidate}" ]] && docker volume inspect "${candidate}" >/dev/null 2>&1; then
      echo "${candidate}"
      return
    fi
  done

  while IFS= read -r candidate; do
    case "${candidate}" in
      reward_postgres_data|*_reward_postgres_data|*-reward_postgres_data)
        echo "${candidate}"
        return
        ;;
    esac
  done < <(docker volume ls --format '{{.Name}}')

  echo "Unable to resolve PostgreSQL volume name. Set DATABASE_VOLUME_NAME." >&2
  exit 1
}

encrypt_file() {
  local input_file="$1"
  local output_file="$2"
  local passphrase="$3"

  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "${input_file}" \
    -out "${output_file}" \
    -pass "pass:${passphrase}"
}

upload_file() {
  local input_file="$1"
  local storage_uri="$2"
  local basename_file

  basename_file="$(basename "${input_file}")"

  case "${storage_uri}" in
    s3://*)
      require_cmd aws
      aws s3 cp --only-show-errors "${input_file}" "${storage_uri%/}/${basename_file}"
      ;;
    ssh://*)
      local remainder remote_host remote_dir
      remainder="${storage_uri#ssh://}"
      remote_host="${remainder%%/*}"
      remote_dir="/${remainder#*/}"
      ssh "${remote_host}" "mkdir -p '${remote_dir}'"
      scp "${input_file}" "${remote_host}:${remote_dir%/}/${basename_file}"
      ;;
    file://*)
      local destination_dir
      destination_dir="${storage_uri#file://}"
      mkdir -p "${destination_dir}"
      cp "${input_file}" "${destination_dir%/}/${basename_file}"
      ;;
    *)
      mkdir -p "${storage_uri}"
      cp "${input_file}" "${storage_uri%/}/${basename_file}"
      ;;
  esac
}

prune_local_runs() {
  local base_dir="$1"
  local retention_days="$2"

  if [[ "${retention_days}" -le 0 || ! -d "${base_dir}/runs" ]]; then
    return
  fi

  find "${base_dir}/runs" -mindepth 1 -maxdepth 1 -type d -mtime "+${retention_days}" -exec rm -rf {} +
}

prune_offsite() {
  local storage_uri="$1"
  local retention_days="$2"
  local prefix="$3"

  if [[ -z "${storage_uri}" || "${retention_days}" -le 0 ]]; then
    return
  fi

  case "${storage_uri}" in
    ssh://*)
      local remainder remote_host remote_dir
      remainder="${storage_uri#ssh://}"
      remote_host="${remainder%%/*}"
      remote_dir="/${remainder#*/}"
      ssh "${remote_host}" \
        "find '${remote_dir}' -type f -name '${prefix}-*' -mtime '+${retention_days}' -delete"
      ;;
    file://*)
      local destination_dir
      destination_dir="${storage_uri#file://}"
      find "${destination_dir}" -type f -name "${prefix}-*" -mtime "+${retention_days}" -delete
      ;;
    s3://*)
      echo "S3 retention pruning is not performed by this script. Use a bucket lifecycle rule for ${storage_uri}." >&2
      ;;
    *)
      find "${storage_uri}" -type f -name "${prefix}-*" -mtime "+${retention_days}" -delete
      ;;
  esac
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

load_env_file "${ENV_FILE:-}"
load_env_file "${COMPOSE_ENV_FILE:-}"

require_cmd docker
require_cmd openssl
require_cmd tar

database_url="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -z "${database_url}" ]]; then
  echo "DATABASE_URL or POSTGRES_URL is required." >&2
  exit 1
fi

backup_passphrase="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
if [[ -z "${backup_passphrase}" ]]; then
  echo "BACKUP_ENCRYPTION_PASSPHRASE is required." >&2
  exit 1
fi

backup_prefix="${BACKUP_PREFIX:-reward-system}"
backup_root="${BACKUP_ROOT:-${repo_root}/var/ops/backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
run_id="${BACKUP_RUN_ID:-${timestamp}}"
run_dir="${backup_root}/runs/${run_id}"
staging_dir="${run_dir}/staging"
logical_dir="${staging_dir}/logical"
volume_dir="${staging_dir}/volume"
artifact_dir="${run_dir}/artifacts"
include_volume_backup="${INCLUDE_VOLUME_BACKUP:-true}"
keep_local_plaintext="${KEEP_LOCAL_PLAINTEXT:-false}"
local_retention_days="${LOCAL_RETENTION_DAYS:-35}"
offsite_retention_days="${OFFSITE_RETENTION_DAYS:-90}"
offsite_storage_uri="${OFFSITE_STORAGE_URI:-}"
volume_name=""

mkdir -p "${logical_dir}" "${artifact_dir}"

logical_output="$(
  BACKUP_DIR="${logical_dir}" \
  BACKUP_TIMESTAMP="${timestamp}" \
  "${script_dir}/postgres-backup.sh" "${backup_prefix}"
)"
printf '%s\n' "${logical_output}"

logical_dump_file="$(extract_output_value "${logical_output}" "BACKUP_DUMP_FILE")"
logical_toc_file="$(extract_output_value "${logical_output}" "BACKUP_TOC_FILE")"
logical_checksum_file="$(extract_output_value "${logical_output}" "BACKUP_CHECKSUM_FILE")"
logical_metadata_file="$(extract_output_value "${logical_output}" "BACKUP_METADATA_FILE")"
logical_dump_s3_uri="$(extract_output_value "${logical_output}" "S3_BACKUP_DUMP_URI")"
logical_toc_s3_uri="$(extract_output_value "${logical_output}" "S3_BACKUP_TOC_URI")"
logical_checksum_s3_uri="$(extract_output_value "${logical_output}" "S3_BACKUP_CHECKSUM_URI")"
logical_metadata_s3_uri="$(extract_output_value "${logical_output}" "S3_BACKUP_METADATA_URI")"
logical_dump_cross_region_s3_uri="$(extract_output_value "${logical_output}" "S3_CROSS_REGION_DUMP_URI")"
logical_toc_cross_region_s3_uri="$(extract_output_value "${logical_output}" "S3_CROSS_REGION_TOC_URI")"
logical_checksum_cross_region_s3_uri="$(extract_output_value "${logical_output}" "S3_CROSS_REGION_CHECKSUM_URI")"
logical_metadata_cross_region_s3_uri="$(extract_output_value "${logical_output}" "S3_CROSS_REGION_METADATA_URI")"

if [[ -z "${logical_dump_file}" || -z "${logical_toc_file}" || -z "${logical_checksum_file}" || -z "${logical_metadata_file}" ]]; then
  echo "Unable to determine logical backup outputs." >&2
  exit 1
fi

logical_bundle_file="${artifact_dir}/${backup_prefix}-logical-${timestamp}.tar.gz"
logical_bundle_checksum="${logical_bundle_file}.sha256"
logical_bundle_encrypted="${logical_bundle_file}.enc"
logical_bundle_encrypted_checksum="${logical_bundle_encrypted}.sha256"

tar -C "${logical_dir}" -czf "${logical_bundle_file}" \
  "$(basename "${logical_dump_file}")" \
  "$(basename "${logical_toc_file}")" \
  "$(basename "${logical_checksum_file}")" \
  "$(basename "${logical_metadata_file}")"

write_checksum "${logical_bundle_file}" "${logical_bundle_checksum}"
encrypt_file "${logical_bundle_file}" "${logical_bundle_encrypted}" "${backup_passphrase}"
write_checksum "${logical_bundle_encrypted}" "${logical_bundle_encrypted_checksum}"

volume_bundle_file=""
volume_bundle_encrypted=""
volume_bundle_checksum=""
volume_bundle_encrypted_checksum=""
volume_metadata_file=""

if bool_is_true "${include_volume_backup}"; then
  mkdir -p "${volume_dir}"
  volume_name="$(resolve_volume_name)"
  volume_archive_file="${volume_dir}/${backup_prefix}-volume-${timestamp}.tar.gz"
  volume_archive_checksum="${volume_archive_file}.sha256"
  volume_metadata_file="${volume_dir}/${backup_prefix}-volume-${timestamp}.metadata.txt"

  docker run --rm \
    -v "${volume_name}:/volume:ro" \
    -v "${volume_dir}:/backup" \
    alpine:3.20 \
    sh -c "tar -C /volume -czf /backup/$(basename "${volume_archive_file}") ."

  write_checksum "${volume_archive_file}" "${volume_archive_checksum}"

  cat > "${volume_metadata_file}" <<EOF
backup_created_at_utc: ${timestamp}
docker_volume_name: ${volume_name}
archive_file: ${volume_archive_file}
archive_checksum_file: ${volume_archive_checksum}
EOF

  volume_bundle_file="${artifact_dir}/${backup_prefix}-volume-${timestamp}.tar.gz"
  volume_bundle_checksum="${volume_bundle_file}.sha256"
  volume_bundle_encrypted="${volume_bundle_file}.enc"
  volume_bundle_encrypted_checksum="${volume_bundle_encrypted}.sha256"

  tar -C "${volume_dir}" -czf "${volume_bundle_file}" \
    "$(basename "${volume_archive_file}")" \
    "$(basename "${volume_archive_checksum}")" \
    "$(basename "${volume_metadata_file}")"

  write_checksum "${volume_bundle_file}" "${volume_bundle_checksum}"
  encrypt_file "${volume_bundle_file}" "${volume_bundle_encrypted}" "${backup_passphrase}"
  write_checksum "${volume_bundle_encrypted}" "${volume_bundle_encrypted_checksum}"
fi

manifest_file="${run_dir}/backup-manifest.json"
cat > "${manifest_file}" <<EOF
{
  "run_id": "${run_id}",
  "created_at_utc": "${timestamp}",
  "backup_prefix": "${backup_prefix}",
  "source_database_url": "$(redact_database_url "${database_url}")",
  "docker_volume_name": "${volume_name}",
  "local_retention_days": ${local_retention_days},
  "offsite_retention_days": ${offsite_retention_days},
  "offsite_storage_uri": "${offsite_storage_uri}",
  "logical_bundle_file": "${logical_bundle_file}",
  "logical_bundle_checksum_file": "${logical_bundle_checksum}",
  "logical_bundle_encrypted_file": "${logical_bundle_encrypted}",
  "logical_bundle_encrypted_checksum_file": "${logical_bundle_encrypted_checksum}",
  "logical_dump_s3_uri": "${logical_dump_s3_uri}",
  "logical_toc_s3_uri": "${logical_toc_s3_uri}",
  "logical_checksum_s3_uri": "${logical_checksum_s3_uri}",
  "logical_metadata_s3_uri": "${logical_metadata_s3_uri}",
  "logical_dump_cross_region_s3_uri": "${logical_dump_cross_region_s3_uri}",
  "logical_toc_cross_region_s3_uri": "${logical_toc_cross_region_s3_uri}",
  "logical_checksum_cross_region_s3_uri": "${logical_checksum_cross_region_s3_uri}",
  "logical_metadata_cross_region_s3_uri": "${logical_metadata_cross_region_s3_uri}",
  "volume_bundle_file": "${volume_bundle_file}",
  "volume_bundle_checksum_file": "${volume_bundle_checksum}",
  "volume_bundle_encrypted_file": "${volume_bundle_encrypted}",
  "volume_bundle_encrypted_checksum_file": "${volume_bundle_encrypted_checksum}"
}
EOF

if [[ -n "${offsite_storage_uri}" ]]; then
  upload_file "${logical_bundle_encrypted}" "${offsite_storage_uri}"
  upload_file "${logical_bundle_encrypted_checksum}" "${offsite_storage_uri}"
  upload_file "${manifest_file}" "${offsite_storage_uri}"

  if [[ -n "${volume_bundle_encrypted}" ]]; then
    upload_file "${volume_bundle_encrypted}" "${offsite_storage_uri}"
    upload_file "${volume_bundle_encrypted_checksum}" "${offsite_storage_uri}"
  fi
fi

if ! bool_is_true "${keep_local_plaintext}"; then
  rm -rf "${staging_dir}"
  rm -f "${logical_bundle_file}" "${logical_bundle_checksum}"
  if [[ -n "${volume_bundle_file}" ]]; then
    rm -f "${volume_bundle_file}" "${volume_bundle_checksum}"
  fi
fi

prune_local_runs "${backup_root}" "${local_retention_days}"
prune_offsite "${offsite_storage_uri}" "${offsite_retention_days}" "${backup_prefix}"

echo "Backup run directory: ${run_dir}"
echo "Manifest: ${manifest_file}"
echo "Logical encrypted bundle: ${logical_bundle_encrypted}"
if [[ -n "${volume_bundle_encrypted}" ]]; then
  echo "Volume encrypted bundle: ${volume_bundle_encrypted}"
fi
echo "OPS_RUN_DIR=${run_dir}"
echo "OPS_MANIFEST_FILE=${manifest_file}"
echo "OPS_LOGICAL_BUNDLE_ENCRYPTED=${logical_bundle_encrypted}"
echo "OPS_LOGICAL_BUNDLE_ENCRYPTED_CHECKSUM=${logical_bundle_encrypted_checksum}"
echo "OPS_VOLUME_BUNDLE_ENCRYPTED=${volume_bundle_encrypted}"
echo "OPS_VOLUME_BUNDLE_ENCRYPTED_CHECKSUM=${volume_bundle_encrypted_checksum}"
