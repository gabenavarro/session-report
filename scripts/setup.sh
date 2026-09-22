#!/usr/bin/env bash
# session-report environment bootstrapper.
#
# Clones the two dependency skills (shallow) into a managed location and
# bootstraps the md2html render environment. Idempotent.
#
#   SESSION_REPORT_HOME  (default: ~/.session-report)
#
# Output: one line per resolved skill path, machine-parseable:
#   SKILL technical-session-writeup <path>
#   SKILL md2html <path>
set -euo pipefail

HOME_DIR="${SESSION_REPORT_HOME:-$HOME/.session-report}"
SKILLS_DIR="$HOME_DIR/skills"
mkdir -p "$SKILLS_DIR"

have() { command -v "$1" >/dev/null 2>&1; }

fetch() {
  local name="$1" url="$2" dest="$3"
  if [ -d "$dest/.git" ]; then
    git -C "$dest" fetch -q origin && git -C "$dest" reset -q --hard origin/main
  else
    git clone -q --depth 1 "$url" "$dest"
  fi
  echo "    $name: $dest"
}

echo "==> session-report setup: $SKILLS_DIR"

WRITEUP_URL="https://github.com/gabenavarro/technical-session-writeup.git"
MD2HTML_URL="https://github.com/gabenavarro/md2html.git"

have git || { echo "error: git is required" >&2; exit 1; }
have python3 || { echo "error: python3 is required (write-up audit gate)" >&2; exit 1; }

fetch technical-session-writeup "$WRITEUP_URL" "$SKILLS_DIR/technical-session-writeup"
fetch md2html "$MD2HTML_URL" "$SKILLS_DIR/md2html"

echo "==> bootstrapping md2html render environment (node deps + .venv)"
bash "$SKILLS_DIR/md2html/scripts/ensure-env.sh"

echo "==> session-report ready"
echo "SKILL technical-session-writeup $SKILLS_DIR/technical-session-writeup"
echo "SKILL md2html $SKILLS_DIR/md2html"
