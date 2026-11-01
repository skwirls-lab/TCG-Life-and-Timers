#!/usr/bin/env bash
# Runs Lighthouse CI; uses the sandbox's preinstalled Chromium when CHROME_PATH is unset.
set -euo pipefail
if [[ -z "${CHROME_PATH:-}" ]]; then
  for c in /opt/pw-browsers/chromium-*/chrome-linux64/chrome; do
    [[ -x "$c" ]] && export CHROME_PATH="$c" && break
  done
fi
exec npx lhci autorun "$@"
