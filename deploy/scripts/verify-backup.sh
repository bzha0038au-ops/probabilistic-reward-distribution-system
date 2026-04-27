#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: verify-backup.sh

Downloads the newest backup artifact from S3, verifies that pg_restore can read
it, and writes a summary report for automation.

Configuration:
  S3_BACKUP_URI                  Required S3 prefix to scan
  BACKUP_S3_PATTERN              Optional filename glob, default: *.dump
  BACKUP_ENCRYPTION_PASSPHRASE   Required when the chosen artifact ends with .enc
  VERIFY_OUTPUT_DIR              Optional output directory
  MIN_SCHEMA_COUNT               Optional sanity threshold, default: 1
  MIN_TABLE_COUNT                Optional sanity threshold, default: 1

Supported artifact types:
  - *.dump
  - *.dump.enc
  - *.tar.gz
  - *.tar.gz.enc
  - *.tgz
  - *.tgz.enc
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

count_schema_entries() {
  local toc_file="$1"

  awk '
    /^[[:space:]]*;/ || /^[[:space:]]*$/ { next }
    {
      n = split($0, sections, ";")
      if (n < 2) {
        next
      }

      remainder = sections[2]
      gsub(/^[[:space:]]+/, "", remainder)
      split(remainder, fields, /[[:space:]]+/)

      if (fields[3] == "SCHEMA") {
        count++
      }
    }
    END { print count + 0 }
  ' "${toc_file}"
}

count_table_entries() {
  local toc_file="$1"

  awk '
    /^[[:space:]]*;/ || /^[[:space:]]*$/ { next }
    {
      n = split($0, sections, ";")
      if (n < 2) {
        next
      }

      remainder = sections[2]
      gsub(/^[[:space:]]+/, "", remainder)
      split(remainder, fields, /[[:space:]]+/)

      if (fields[3] == "TABLE" && fields[4] != "DATA") {
        count++
      }
    }
    END { print count + 0 }
  ' "${toc_file}"
}

count_toc_entries() {
  local toc_file="$1"

  awk '
    /^[[:space:]]*;/ || /^[[:space:]]*$/ { next }
    { count++ }
    END { print count + 0 }
  ' "${toc_file}"
}

count_non_empty_lines() {
  local input_file="$1"

  if [[ ! -f "${input_file}" ]]; then
    printf '0\n'
    return
  fi

  awk '
    /^[[:space:]]*$/ { next }
    { count++ }
    END { print count + 0 }
  ' "${input_file}"
}

find_latest_backup_object() {
  local source_uri="$1"
  local pattern="$2"
  local s3_listing=""
  local latest_date=""
  local latest_time=""
  local latest_size=""
  local latest_key=""

  s3_listing="$(aws s3 ls "${source_uri%/}/" --recursive)"

  while read -r object_date object_time object_size object_key; do
    local object_name

    if [[ -z "${object_key:-}" ]]; then
      continue
    fi

    object_name="${object_key##*/}"
    case "${object_name}" in
      ${pattern})
        latest_date="${object_date}"
        latest_time="${object_time}"
        latest_size="${object_size}"
        latest_key="${object_key}"
        ;;
    esac
  done <<< "$(printf '%s\n' "${s3_listing}" | sort -k1,1 -k2,2)"

  if [[ -z "${latest_key}" ]]; then
    failure_reason="No backup object matching pattern ${pattern} under ${source_uri}."
    exit 1
  fi

  latest_object_timestamp_utc="${latest_date}T${latest_time}Z"
  latest_object_size_bytes="${latest_size}"

  printf '%s\n' "${latest_key}"
}

decrypt_if_needed() {
  local input_file="$1"
  local output_dir="$2"
  local candidate_file="${input_file}"

  if [[ "${candidate_file}" != *.enc ]]; then
    printf '%s\n' "${candidate_file}"
    return
  fi

  require_cmd openssl

  if [[ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
    failure_reason="BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backup artifacts."
    exit 1
  fi

  local decrypted_file="${output_dir}/$(basename "${candidate_file%.enc}")"

  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "${candidate_file}" \
    -out "${decrypted_file}" \
    -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}"

  printf '%s\n' "${decrypted_file}"
}

resolve_dump_file() {
  local input_file="$1"
  local output_dir="$2"
  local extracted_dir="${output_dir}/extracted"
  local resolved_file=""

  mkdir -p "${extracted_dir}"

  case "${input_file}" in
    *.dump)
      printf '%s\n' "${input_file}"
      return
      ;;
    *.tar.gz|*.tgz)
      require_cmd tar
      tar -C "${extracted_dir}" -xzf "${input_file}"
      ;;
    *.tar)
      require_cmd tar
      tar -C "${extracted_dir}" -xf "${input_file}"
      ;;
    *)
      failure_reason="Unsupported backup artifact type: ${input_file}"
      exit 1
      ;;
  esac

  resolved_file="$(find "${extracted_dir}" -maxdepth 1 -type f -name '*.dump' | head -n 1)"
  if [[ -z "${resolved_file}" ]]; then
    failure_reason="No .dump file found after extracting ${input_file}."
    exit 1
  fi

  printf '%s\n' "${resolved_file}"
}

render_report() {
  mkdir -p "${verify_output_dir}"

  cat > "${summary_file}" <<EOF
status=${status}
source_prefix=${s3_backup_uri}
matched_pattern=${backup_pattern}
object_uri=${latest_object_uri}
object_timestamp_utc=${latest_object_timestamp_utc}
object_size_bytes=${latest_object_size_bytes}
downloaded_artifact=${downloaded_artifact_file}
resolved_dump_file=${resolved_dump_file}
pg_restore_exit_code=${pg_restore_exit_code}
toc_entry_count=${toc_entry_count}
schema_line_count=${schema_line_count}
table_line_count=${table_line_count}
error_line_count=${error_line_count}
failure_reason=${failure_reason}
EOF

  cat > "${report_file}" <<EOF
# Backup Verify Report

- Status: \`${status}\`
- Source prefix: \`${s3_backup_uri}\`
- Matched pattern: \`${backup_pattern}\`
- Object URI: \`${latest_object_uri}\`
- Object timestamp (UTC): \`${latest_object_timestamp_utc}\`
- Object size (bytes): \`${latest_object_size_bytes}\`
- Downloaded artifact: \`${downloaded_artifact_file}\`
- Resolved dump: \`${resolved_dump_file}\`
- \`pg_restore --list\` exit code: \`${pg_restore_exit_code}\`
- TOC entry count: \`${toc_entry_count}\`
- Schema line count: \`${schema_line_count}\`
- Table line count: \`${table_line_count}\`
- Error line count: \`${error_line_count}\`
- Failure reason: \`${failure_reason:-none}\`
EOF

  if [[ -s "${pg_restore_stderr_file}" ]]; then
    {
      printf '\n## pg_restore stderr\n\n'
      printf '```text\n'
      sed -n '1,200p' "${pg_restore_stderr_file}"
      printf '```\n'
    } >> "${report_file}"
  fi
}

print_outputs() {
  echo "Backup verification status: ${status}"
  echo "Verified object: ${latest_object_uri}"
  echo "Schema line count: ${schema_line_count}"
  echo "Table line count: ${table_line_count}"
  echo "Error line count: ${error_line_count}"
  echo "VERIFY_BACKUP_SUMMARY_FILE=${summary_file}"
  echo "VERIFY_BACKUP_REPORT_FILE=${report_file}"
  echo "VERIFY_BACKUP_TOC_FILE=${pg_restore_toc_file}"
  echo "VERIFY_BACKUP_STDERR_FILE=${pg_restore_stderr_file}"
  echo "VERIFY_BACKUP_OBJECT_URI=${latest_object_uri}"
  echo "VERIFY_BACKUP_DUMP_FILE=${resolved_dump_file}"
  echo "VERIFY_BACKUP_STATUS=${status}"
  echo "VERIFY_BACKUP_SCHEMA_COUNT=${schema_line_count}"
  echo "VERIFY_BACKUP_TABLE_COUNT=${table_line_count}"
  echo "VERIFY_BACKUP_ERROR_COUNT=${error_line_count}"
}

on_exit() {
  local exit_code="$1"

  if [[ "${exit_code}" -eq 0 ]]; then
    status="passed"
  else
    status="failed"
  fi

  if [[ "${exit_code}" -ne 0 && -z "${failure_reason}" ]]; then
    failure_reason="verify-backup.sh exited with code ${exit_code}."
  fi

  render_report
  print_outputs

  trap - EXIT
  exit "${exit_code}"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd aws
require_cmd pg_restore

s3_backup_uri="${S3_BACKUP_URI:-}"
if [[ -z "${s3_backup_uri}" ]]; then
  echo "S3_BACKUP_URI is required." >&2
  exit 1
fi

case "${s3_backup_uri}" in
  s3://*)
    ;;
  *)
    echo "S3_BACKUP_URI must start with s3://." >&2
    exit 1
    ;;
esac

backup_pattern="${BACKUP_S3_PATTERN:-*.dump}"
verify_output_dir="${VERIFY_OUTPUT_DIR:-${TMPDIR:-/tmp}/reward-system-backup-verify}"
min_schema_count="${MIN_SCHEMA_COUNT:-1}"
min_table_count="${MIN_TABLE_COUNT:-1}"

summary_file="${verify_output_dir}/verify-backup-summary.txt"
report_file="${verify_output_dir}/verify-backup-report.md"
pg_restore_toc_file="${verify_output_dir}/pg-restore.list.txt"
pg_restore_stderr_file="${verify_output_dir}/pg-restore.stderr.txt"
download_dir="${verify_output_dir}/download"
latest_object_uri=""
latest_object_timestamp_utc=""
latest_object_size_bytes="0"
downloaded_artifact_file=""
resolved_dump_file=""
status="failed"
pg_restore_exit_code="not-run"
toc_entry_count="0"
schema_line_count="0"
table_line_count="0"
error_line_count="0"
failure_reason=""

mkdir -p "${verify_output_dir}" "${download_dir}"
trap 'on_exit $?' EXIT

bucket_and_prefix="${s3_backup_uri#s3://}"
bucket_name="${bucket_and_prefix%%/*}"
latest_object_key="$(find_latest_backup_object "${s3_backup_uri}" "${backup_pattern}")"
latest_object_uri="s3://${bucket_name}/${latest_object_key}"
downloaded_artifact_file="${download_dir}/$(basename "${latest_object_key}")"

aws s3 cp --only-show-errors "${latest_object_uri}" "${downloaded_artifact_file}"

download_candidate_file="$(decrypt_if_needed "${downloaded_artifact_file}" "${download_dir}")"
resolved_dump_file="$(resolve_dump_file "${download_candidate_file}" "${download_dir}")"

set +e
pg_restore --list "${resolved_dump_file}" > "${pg_restore_toc_file}" 2> "${pg_restore_stderr_file}"
pg_restore_exit_code="$?"
set -e

toc_entry_count="$(count_toc_entries "${pg_restore_toc_file}")"
schema_line_count="$(count_schema_entries "${pg_restore_toc_file}")"
table_line_count="$(count_table_entries "${pg_restore_toc_file}")"
error_line_count="$(count_non_empty_lines "${pg_restore_stderr_file}")"

if [[ "${pg_restore_exit_code}" -ne 0 ]]; then
  failure_reason="pg_restore --list failed for ${resolved_dump_file}."
  exit "${pg_restore_exit_code}"
fi

if (( schema_line_count < min_schema_count )); then
  failure_reason="Schema line count ${schema_line_count} is below MIN_SCHEMA_COUNT=${min_schema_count}."
  exit 1
fi

if (( table_line_count < min_table_count )); then
  failure_reason="Table line count ${table_line_count} is below MIN_TABLE_COUNT=${min_table_count}."
  exit 1
fi
