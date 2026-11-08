#!/usr/bin/env bash
# PFN launcher for macOS and Linux.
#
#   ./start.sh            start the app and open its window
#   ./start.sh --stop     stop a running instance
#
# macOS: double-click start.command instead (Finder won't run a .sh directly).
set -euo pipefail
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python не найден. Установите Python 3.10+ и повторите запуск." >&2
  exit 1
fi

exec "$PYTHON" launcher.py "$@"
