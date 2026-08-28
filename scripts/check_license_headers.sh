#!/usr/bin/env bash
# Abetworks — proprietary-header verifier.
# Fails (exit 1) if any tracked TS/Python source file is missing the header.
# Intended for CI. Run from anywhere inside the repo.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MARKER="Abetworks Proprietary"
missing=0
checked=0

while IFS= read -r f; do
  [ -f "$f" ] || continue
  checked=$((checked + 1))
  if ! grep -q "$MARKER" "$f"; then
    echo "MISSING HEADER: $f"
    missing=$((missing + 1))
  fi
done < <(git ls-files 'niche-plans/**/*.ts' 'niche-plans/**/*.py' 'platform/**/*.ts' 'platform/**/*.py')

echo "checked $checked file(s), $missing missing header(s)"
if [ "$missing" -ne 0 ]; then
  echo "FAIL: proprietary header missing from $missing file(s). Run scripts/add_license_headers.sh"
  exit 1
fi
echo "OK: all source files carry the Abetworks proprietary header."
