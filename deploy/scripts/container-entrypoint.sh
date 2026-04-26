#!/bin/sh
set -eu

resolve_file_env() {
  var_name="$1"
  file_var_name="${var_name}_FILE"

  eval "var_value=\${$var_name-}"
  eval "file_path=\${$file_var_name-}"

  if [ -n "${var_value}" ] && [ -n "${file_path}" ]; then
    echo >&2 "error: both ${var_name} and ${file_var_name} are set"
    exit 1
  fi

  if [ -z "${file_path}" ]; then
    return
  fi

  if [ ! -r "${file_path}" ]; then
    echo >&2 "error: secret file for ${var_name} is not readable: ${file_path}"
    exit 1
  fi

  export "${var_name}=$(cat "${file_path}")"
  unset "${file_var_name}"
}

for file_var_name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)_FILE=.*/\1/p'); do
  resolve_file_env "${file_var_name}"
done

exec "$@"
