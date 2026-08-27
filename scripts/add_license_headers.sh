#!/usr/bin/env bash
# Abetworks — idempotent license-header inserter.
# Prepends a proprietary notice to every tracked TS/Python source file.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MARKER="Abetworks Proprietary"
YEAR=2026

ts_header() {
  cat <<EOF
/*
 * Copyright (c) ${YEAR} Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */
EOF
}

py_header() {
  cat <<EOF
# Copyright (c) ${YEAR} Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in
EOF
}

count=0
skipped=0

while IFS= read -r f; do
  [ -f "$f" ] || continue
  if grep -q "$MARKER" "$f"; then
    skipped=$((skipped + 1))
    continue
  fi
  tmp="$(mktemp)"
  case "$f" in
    *.ts) ts_header > "$tmp" ; echo >> "$tmp" ;;  # blank line after ts header
    *.py) py_header > "$tmp" ; echo >> "$tmp" ;;  # blank line after py header
  esac
  cat "$f" >> "$tmp"
  mv "$tmp" "$f"
  count=$((count + 1))
done < <(git ls-files 'niche-plans/**/*.ts' 'niche-plans/**/*.py')

echo "headers added: $count, skipped (already present): $skipped"
