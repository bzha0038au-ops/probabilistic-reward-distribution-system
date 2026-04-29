#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

resolve_node_bin() {
  if [ -n "${REWARD_SYSTEM_NODE:-}" ] && [ -x "${REWARD_SYSTEM_NODE}" ]; then
    printf '%s\n' "${REWARD_SYSTEM_NODE}"
    return 0
  fi

  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "${candidate}" ]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

NODE_BIN=$(resolve_node_bin || true)

if [ -z "${NODE_BIN}" ]; then
  cat >&2 <<'EOF'
Vitest requires a system Node runtime because the Codex-bundled Node binary
cannot load Rollup's native darwin module under macOS library validation.

Install Node via Homebrew, or set REWARD_SYSTEM_NODE to a compatible node path.
EOF
  exit 1
fi

exec "${NODE_BIN}" "${ROOT_DIR}/node_modules/vitest/vitest.mjs" "$@"
