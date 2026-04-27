#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: remote-release.sh

Runs on the deployment host after release assets have been uploaded and the
release directory has been staged.

Required environment:
  RELEASE_SHA
  RELEASE_DIR
  DEPLOY_PATH
  DEPLOY_ENVIRONMENT
  SHARED_ENV_DIR
  SHARED_OPS_DIR
  SHARED_SECRETS_DIR

Optional environment:
  SHARED_PROXY_DIR
  DEPLOY_MONITOR_DURATION_SECONDS        Default: 900
  DEPLOY_MONITOR_INTERVAL_SECONDS        Default: 30
  DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS Default: 300
  DEPLOY_MONITOR_5XX_RATIO_THRESHOLD     Default: 0.05
  DEPLOY_MONITOR_DRAW_ERROR_THRESHOLD    Default: 0.02
  DEPLOY_MONITOR_MIN_REQUESTS            Default: 20
  DEPLOY_MONITOR_MIN_DRAWS               Default: 10
  DEPLOY_MONITOR_CONSECUTIVE_FAILURES    Default: 2
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is not set: ${name}" >&2
    exit 1
  fi
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

extract_output_value() {
  local output="$1"
  local key="$2"

  printf '%s\n' "${output}" | awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1) }' | tail -n 1
}

ratio() {
  local numerator="$1"
  local denominator="$2"

  awk -v numerator="${numerator}" -v denominator="${denominator}" 'BEGIN {
    if (denominator <= 0) {
      printf "0\n";
      exit 0;
    }
    printf "%.6f\n", numerator / denominator;
  }'
}

ratio_gt() {
  local actual="$1"
  local threshold="$2"

  awk -v actual="${actual}" -v threshold="${threshold}" 'BEGIN { exit !(actual > threshold) }'
}

cleanup_tmp_assets() {
  rm -f \
    "/tmp/reward-system-compose-${RELEASE_SHA}.yml" \
    "/tmp/reward-system-backend-${RELEASE_SHA}.tar.gz" \
    "/tmp/reward-system-frontend-${RELEASE_SHA}.tar.gz" \
    "/tmp/reward-system-admin-${RELEASE_SHA}.tar.gz" \
    "/tmp/reward-system-ops-${RELEASE_SHA}.tar.gz"
}

compose_cmd() {
  docker compose -f "${1}/docker-compose.prod.yml" "${@:2}"
}

service_container_id() {
  local release_root="$1"
  local service="$2"

  compose_cmd "${release_root}" ps -q "${service}" | tail -n 1
}

container_status() {
  local container_id="$1"

  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}"
}

wait_for_service() {
  local release_root="$1"
  local service="$2"
  local timeout_seconds="$3"
  local deadline
  local container_id=""
  local status=""

  deadline=$(( $(date +%s) + timeout_seconds ))

  while (( $(date +%s) <= deadline )); do
    container_id="$(service_container_id "${release_root}" "${service}")"
    if [[ -n "${container_id}" ]]; then
      status="$(container_status "${container_id}")"
      if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
        return 0
      fi
    fi
    sleep 5
  done

  echo "Timed out waiting for ${service} to become healthy in ${release_root}. Last status: ${status:-unknown}" >&2
  return 1
}

fetch_backend_snapshot() {
  local release_root="$1"
  local backend_container

  backend_container="$(service_container_id "${release_root}" backend)"
  if [[ -z "${backend_container}" ]]; then
    echo "READY_HTTP_STATUS=000"
    echo "READY_STATUS=container_missing"
    echo "METRICS_HTTP_STATUS=000"
    echo "METRICS_BEGIN"
    echo "METRICS_END"
    return 0
  fi

  docker exec "${backend_container}" node <<'NODE'
const fetchTarget = async (path) => {
  try {
    const response = await fetch(`http://127.0.0.1:4000${path}`);
    return {
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    return {
      status: 0,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const ready = await fetchTarget('/health/ready');
const metrics = await fetchTarget('/metrics');

let readyStatus = 'unknown';
if (ready.text) {
  try {
    const payload = JSON.parse(ready.text);
    if (payload && typeof payload.status === 'string' && payload.status.trim() !== '') {
      readyStatus = payload.status.trim();
    }
  } catch {
    readyStatus = 'invalid_json';
  }
}

process.stdout.write(`READY_HTTP_STATUS=${ready.status || 0}\n`);
process.stdout.write(`READY_STATUS=${readyStatus}\n`);
if (ready.error) {
  process.stdout.write(`READY_ERROR=${ready.error}\n`);
}
process.stdout.write(`METRICS_HTTP_STATUS=${metrics.status || 0}\n`);
if (metrics.error) {
  process.stdout.write(`METRICS_ERROR=${metrics.error}\n`);
}
process.stdout.write('METRICS_BEGIN\n');
process.stdout.write(metrics.text || '');
if (!metrics.text || !metrics.text.endsWith('\n')) {
  process.stdout.write('\n');
}
process.stdout.write('METRICS_END\n');
NODE
}

parse_metrics_totals() {
  awk '
    /^reward_backend_http_requests_total\{/ {
      value = $NF + 0
      http_total += value
      if ($0 ~ /status_code="5[0-9][0-9]"/) {
        http_5xx += value
      }
    }
    /^reward_backend_draw_requests_total\{/ {
      value = $NF + 0
      draw_total += value
      if ($0 ~ /outcome="error"/) {
        draw_error += value
      }
    }
    END {
      printf "HTTP_TOTAL=%.0f\n", http_total
      printf "HTTP_5XX=%.0f\n", http_5xx
      printf "DRAW_TOTAL=%.0f\n", draw_total
      printf "DRAW_ERROR=%.0f\n", draw_error
    }
  '
}

load_state() {
  if [[ -f "${STATE_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${STATE_FILE}"
    set +a
  fi
}

write_state() {
  local target_file="$1"
  local tmp_file

  tmp_file="$(mktemp "${target_file}.tmp.XXXXXX")"
  cat > "${tmp_file}"
  mv "${tmp_file}" "${target_file}"
}

update_state_success() {
  write_state "${STATE_FILE}" <<EOF
CURRENT_RELEASE_SHA=${RELEASE_SHA}
PREVIOUS_KNOWN_GOOD_SHA=${RELEASE_SHA}
LAST_ATTEMPTED_RELEASE_SHA=${RELEASE_SHA}
LAST_DEPLOY_RESULT=success
LAST_DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
}

update_state_rollback() {
  local rollback_sha="$1"

  write_state "${STATE_FILE}" <<EOF
CURRENT_RELEASE_SHA=${rollback_sha}
PREVIOUS_KNOWN_GOOD_SHA=${rollback_sha}
LAST_ATTEMPTED_RELEASE_SHA=${RELEASE_SHA}
LAST_DEPLOY_RESULT=rolled_back
LAST_FAILED_RELEASE_SHA=${RELEASE_SHA}
LAST_DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LAST_ROLLBACK_TO_SHA=${rollback_sha}
LAST_ROLLBACK_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
}

tag_previous_known_good() {
  docker tag "${BACKEND_IMAGE}:${RELEASE_SHA}" "${BACKEND_IMAGE}:previous-known-good"
  docker tag "${FRONTEND_IMAGE}:${RELEASE_SHA}" "${FRONTEND_IMAGE}:previous-known-good"
  docker tag "${ADMIN_IMAGE}:${RELEASE_SHA}" "${ADMIN_IMAGE}:previous-known-good"
}

deploy_release() {
  export IMAGE_TAG="${RELEASE_SHA}"
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-reward-system}"

  gunzip -c "/tmp/reward-system-backend-${RELEASE_SHA}.tar.gz" | docker load
  gunzip -c "/tmp/reward-system-frontend-${RELEASE_SHA}.tar.gz" | docker load
  gunzip -c "/tmp/reward-system-admin-${RELEASE_SHA}.tar.gz" | docker load

  compose_cmd "${RELEASE_DIR}" up -d postgres redis
  compose_cmd "${RELEASE_DIR}" run --rm migrate
  compose_cmd "${RELEASE_DIR}" up -d --remove-orphans \
    postgres \
    redis \
    backend \
    notification-worker \
    frontend \
    admin \
    reverse-proxy

  wait_for_service "${RELEASE_DIR}" backend "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${RELEASE_DIR}" frontend "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${RELEASE_DIR}" admin "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${RELEASE_DIR}" reverse-proxy "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
}

rollback_release() {
  local rollback_sha="$1"
  local rollback_release_dir="$2"

  export IMAGE_TAG="previous-known-good"
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-reward-system}"

  compose_cmd "${rollback_release_dir}" up -d --remove-orphans \
    postgres \
    redis \
    backend \
    notification-worker \
    frontend \
    admin \
    reverse-proxy

  wait_for_service "${rollback_release_dir}" backend "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${rollback_release_dir}" frontend "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${rollback_release_dir}" admin "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"
  wait_for_service "${rollback_release_dir}" reverse-proxy "${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS}"

  update_state_rollback "${rollback_sha}"
}

monitor_release() {
  local deadline
  local baseline_http_total=""
  local baseline_http_5xx=""
  local baseline_draw_total=""
  local baseline_draw_error=""
  local consecutive_failures=0
  local sample_output=""
  local metrics_text=""
  local metrics_totals=""
  local ready_http_status=""
  local ready_status=""
  local metrics_http_status=""
  local http_total=0
  local http_5xx=0
  local draw_total=0
  local draw_error=0
  local delta_http_total=0
  local delta_http_5xx=0
  local delta_draw_total=0
  local delta_draw_error=0
  local http_ratio_value="0"
  local draw_ratio_value="0"
  local sample_failed=0
  local sample_failure_reason=""

  deadline=$(( $(date +%s) + DEPLOY_MONITOR_DURATION_SECONDS ))

  while :; do
    sample_output="$(fetch_backend_snapshot "${RELEASE_DIR}")"
    ready_http_status="$(extract_output_value "${sample_output}" READY_HTTP_STATUS)"
    ready_status="$(extract_output_value "${sample_output}" READY_STATUS)"
    metrics_http_status="$(extract_output_value "${sample_output}" METRICS_HTTP_STATUS)"

    metrics_text="$(printf '%s\n' "${sample_output}" | sed -n '/^METRICS_BEGIN$/,/^METRICS_END$/p' | sed '1d;$d')"
    metrics_totals="$(printf '%s\n' "${metrics_text}" | parse_metrics_totals)"

    http_total="$(extract_output_value "${metrics_totals}" HTTP_TOTAL)"
    http_5xx="$(extract_output_value "${metrics_totals}" HTTP_5XX)"
    draw_total="$(extract_output_value "${metrics_totals}" DRAW_TOTAL)"
    draw_error="$(extract_output_value "${metrics_totals}" DRAW_ERROR)"

    if [[ -z "${baseline_http_total}" ]]; then
      baseline_http_total="${http_total:-0}"
      baseline_http_5xx="${http_5xx:-0}"
      baseline_draw_total="${draw_total:-0}"
      baseline_draw_error="${draw_error:-0}"
    fi

    delta_http_total=$(( ${http_total:-0} - ${baseline_http_total:-0} ))
    delta_http_5xx=$(( ${http_5xx:-0} - ${baseline_http_5xx:-0} ))
    delta_draw_total=$(( ${draw_total:-0} - ${baseline_draw_total:-0} ))
    delta_draw_error=$(( ${draw_error:-0} - ${baseline_draw_error:-0} ))

    http_ratio_value="$(ratio "${delta_http_5xx}" "${delta_http_total}")"
    draw_ratio_value="$(ratio "${delta_draw_error}" "${delta_draw_total}")"

    sample_failed=0
    sample_failure_reason=""

    if [[ "${ready_http_status:-0}" != "200" ]]; then
      sample_failed=1
      sample_failure_reason="readiness_http=${ready_http_status:-0} readiness_status=${ready_status:-unknown}"
    fi

    if [[ "${metrics_http_status:-0}" != "200" ]]; then
      sample_failed=1
      sample_failure_reason="${sample_failure_reason} metrics_http=${metrics_http_status:-0}"
    fi

    if (( delta_http_total >= DEPLOY_MONITOR_MIN_REQUESTS )) && ratio_gt "${http_ratio_value}" "${DEPLOY_MONITOR_5XX_RATIO_THRESHOLD}"; then
      sample_failed=1
      sample_failure_reason="${sample_failure_reason} http_5xx_ratio=${http_ratio_value}"
    fi

    if (( delta_draw_total >= DEPLOY_MONITOR_MIN_DRAWS )) && ratio_gt "${draw_ratio_value}" "${DEPLOY_MONITOR_DRAW_ERROR_THRESHOLD}"; then
      sample_failed=1
      sample_failure_reason="${sample_failure_reason} draw_error_ratio=${draw_ratio_value}"
    fi

    printf '%s monitor ready_http=%s ready_status=%s metrics_http=%s http_total=%s http_5xx=%s http_5xx_ratio=%s draw_total=%s draw_error=%s draw_error_ratio=%s\n' \
      "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      "${ready_http_status:-0}" \
      "${ready_status:-unknown}" \
      "${metrics_http_status:-0}" \
      "${delta_http_total}" \
      "${delta_http_5xx}" \
      "${http_ratio_value}" \
      "${delta_draw_total}" \
      "${delta_draw_error}" \
      "${draw_ratio_value}"

    if (( sample_failed == 1 )); then
      consecutive_failures=$(( consecutive_failures + 1 ))
    else
      consecutive_failures=0
    fi

    if (( consecutive_failures >= DEPLOY_MONITOR_CONSECUTIVE_FAILURES )); then
      MONITOR_FAILURE_REASON="$(printf '%s' "${sample_failure_reason}" | sed -E 's/^ +//; s/ +$//; s/ +/ /g')"
      return 1
    fi

    if (( $(date +%s) >= deadline )); then
      return 0
    fi

    sleep "${DEPLOY_MONITOR_INTERVAL_SECONDS}"
  done
}

require_cmd docker
require_cmd gunzip
require_cmd awk
require_cmd sed
require_cmd ln
require_cmd date

require_env RELEASE_SHA
require_env RELEASE_DIR
require_env DEPLOY_PATH
require_env DEPLOY_ENVIRONMENT
require_env SHARED_ENV_DIR
require_env SHARED_OPS_DIR
require_env SHARED_SECRETS_DIR

DEPLOY_MONITOR_DURATION_SECONDS="${DEPLOY_MONITOR_DURATION_SECONDS:-900}"
DEPLOY_MONITOR_INTERVAL_SECONDS="${DEPLOY_MONITOR_INTERVAL_SECONDS:-30}"
DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS="${DEPLOY_MONITOR_STARTUP_TIMEOUT_SECONDS:-300}"
DEPLOY_MONITOR_5XX_RATIO_THRESHOLD="${DEPLOY_MONITOR_5XX_RATIO_THRESHOLD:-0.05}"
DEPLOY_MONITOR_DRAW_ERROR_THRESHOLD="${DEPLOY_MONITOR_DRAW_ERROR_THRESHOLD:-0.02}"
DEPLOY_MONITOR_MIN_REQUESTS="${DEPLOY_MONITOR_MIN_REQUESTS:-20}"
DEPLOY_MONITOR_MIN_DRAWS="${DEPLOY_MONITOR_MIN_DRAWS:-10}"
DEPLOY_MONITOR_CONSECUTIVE_FAILURES="${DEPLOY_MONITOR_CONSECUTIVE_FAILURES:-2}"

STATE_FILE="${SHARED_OPS_DIR}/release-state.env"
CURRENT_SYMLINK="${DEPLOY_PATH}/current"
PREVIOUS_RELEASE_DIR="$(readlink -f "${CURRENT_SYMLINK}" 2>/dev/null || true)"
ROLLBACK_RELEASE_DIR="${PREVIOUS_RELEASE_DIR}"
BACKEND_IMAGE="reward-system/backend"
FRONTEND_IMAGE="reward-system/frontend"
ADMIN_IMAGE="reward-system/admin"
MONITOR_FAILURE_REASON=""

trap cleanup_tmp_assets EXIT

load_env_file "${SHARED_ENV_DIR}/compose.env"
load_state

BACKEND_IMAGE="${BACKEND_IMAGE:-reward-system/backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-reward-system/frontend}"
ADMIN_IMAGE="${ADMIN_IMAGE:-reward-system/admin}"

echo "ATTEMPTED_RELEASE_SHA=${RELEASE_SHA}"

for env_file in backend.env postgres.env frontend.env admin.env compose.env; do
  test -f "${SHARED_ENV_DIR}/${env_file}"
done

for secret_file in \
  postgres_password \
  redis_password \
  backend_database_url \
  backend_redis_url \
  admin_jwt_secret \
  user_jwt_secret \
  admin_mfa_encryption_secret \
  admin_mfa_break_glass_secret \
  frontend_auth_secret; do
  test -f "${SHARED_SECRETS_DIR}/${secret_file}"
done

test -n "${APP_DOMAIN:-}"
test -n "${ADMIN_DOMAIN:-}"
test -n "${API_DOMAIN:-}"
test -n "${TLS_ACME_EMAIL:-}"

deploy_release

if monitor_release; then
  tag_previous_known_good
  update_state_success
  ln -sfn "${RELEASE_DIR}" "${CURRENT_SYMLINK}"
  echo "DEPLOY_RESULT=success"
  echo "CURRENT_RELEASE_SHA=${RELEASE_SHA}"
  exit 0
fi

rollback_sha="${PREVIOUS_KNOWN_GOOD_SHA:-}"
if [[ -z "${rollback_sha}" ]]; then
  echo "DEPLOY_RESULT=failed_no_rollback"
  echo "FAILURE_REASON=${MONITOR_FAILURE_REASON}"
  exit 1
fi

if ! docker image inspect "${BACKEND_IMAGE}:previous-known-good" >/dev/null 2>&1 \
  || ! docker image inspect "${FRONTEND_IMAGE}:previous-known-good" >/dev/null 2>&1 \
  || ! docker image inspect "${ADMIN_IMAGE}:previous-known-good" >/dev/null 2>&1; then
  echo "DEPLOY_RESULT=failed_no_rollback"
  echo "FAILURE_REASON=${MONITOR_FAILURE_REASON} missing_previous_known_good_image=true"
  exit 1
fi

if [[ -z "${ROLLBACK_RELEASE_DIR}" || ! -f "${ROLLBACK_RELEASE_DIR}/docker-compose.prod.yml" ]]; then
  ROLLBACK_RELEASE_DIR="${RELEASE_DIR}"
fi

rollback_release "${rollback_sha}" "${ROLLBACK_RELEASE_DIR}"

echo "DEPLOY_RESULT=rolled_back"
echo "CURRENT_RELEASE_SHA=${rollback_sha}"
echo "ROLLBACK_RELEASE_SHA=${rollback_sha}"
echo "FAILURE_REASON=${MONITOR_FAILURE_REASON}"
