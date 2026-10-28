#!/usr/bin/env bash
# Starts the backend (FastAPI, :8000) and the frontend (Vite, :5173), waits until both answer,
# opens the app in your browser, and stops everything when you press Ctrl+C.
#
#   ./run.sh              # run everything, open the browser
#   NO_OPEN=1 ./run.sh    # do not open a browser tab
#   MOCK=1 ./run.sh       # frontend only, recorded fixture data (no backend needed)
#
# First run installs dependencies (Python venv in backend/.venv, node_modules in frontend/).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Defaults are what the app expects: the backend only accepts the origin http://localhost:5173 and the frontend
# connects to :8000. Override only for testing the script itself (the pages will then not talk to each other).
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
# Always use "localhost" (not 127.0.0.1) in the browser.
URL="http://localhost:${FRONTEND_PORT}/"
[[ "${MOCK:-0}" == "1" ]] && URL="${URL}?mock=east_surge"
PIDS=()

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

cleanup() {
  trap - EXIT INT TERM
  [[ ${#PIDS[@]} -gt 0 ]] || return 0
  say "Stopping..."
  for pid in "${PIDS[@]}"; do kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---- checks ---------------------------------------------------------------------------------
command -v node >/dev/null || die "Node.js is not installed (need 22.12 or newer)."
command -v npm  >/dev/null || die "npm is not installed."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node $(node -v) is too old: the frontend needs 22.12 or newer."
port_busy "$FRONTEND_PORT" && die "Port ${FRONTEND_PORT} is already in use (is another dev server running?)."
if [[ "${MOCK:-0}" != "1" ]]; then
  port_busy "$BACKEND_PORT" && die "Port ${BACKEND_PORT} is already in use (is another backend running?)."
fi

# ---- backend --------------------------------------------------------------------------------
if [[ "${MOCK:-0}" != "1" ]]; then
  VENV="$ROOT/backend/.venv"
  if [[ ! -x "$VENV/bin/uvicorn" ]]; then
    say "Setting up the Python environment (first run only)..."
    if command -v python3.12 >/dev/null; then
      python3.12 -m venv "$VENV"
      "$VENV/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
    elif command -v uv >/dev/null; then
      uv venv -q --python 3.12 "$VENV"            # downloads Python 3.12 if you do not have it
      uv pip install -q --python "$VENV/bin/python" -r "$ROOT/backend/requirements.txt"
    else
      die "Python 3.12 not found. Install it, or install uv (https://docs.astral.sh/uv/) and re-run."
    fi
  fi
  say "Starting the backend on http://127.0.0.1:${BACKEND_PORT}"
  (cd "$ROOT/backend" && exec setsid "$VENV/bin/uvicorn" app.api:app --host 127.0.0.1 --port "$BACKEND_PORT" --workers 1) &
  PIDS+=($!)
fi

# ---- frontend -------------------------------------------------------------------------------
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  say "Installing frontend packages (first run only)..."
  (cd "$ROOT/frontend" && npm ci --no-audit --no-fund)
fi
say "Starting the frontend on ${URL}"
(cd "$ROOT/frontend" && exec setsid npm run dev -- --port "$FRONTEND_PORT" --strictPort) &
PIDS+=($!)

# ---- wait until ready -----------------------------------------------------------------------
wait_for() {  # url, label
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "$1" 2>/dev/null && return 0
    for pid in "${PIDS[@]}"; do kill -0 "$pid" 2>/dev/null || die "$2 stopped unexpectedly (see the output above)."; done
    sleep 1
  done
  die "$2 did not start within 60 seconds."
}
[[ "${MOCK:-0}" != "1" ]] && wait_for "http://127.0.0.1:${BACKEND_PORT}/health" "The backend"
wait_for "$URL" "The frontend"

say "Ready: ${URL}   (Ctrl+C to stop)"
if [[ "${NO_OPEN:-0}" != "1" ]]; then
  if   command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open     >/dev/null; then open "$URL" >/dev/null 2>&1 &
  else say "Open ${URL} in your browser."; fi
fi

wait
