#!/usr/bin/env bash
# Abetworks — run every service test suite (TS + Python). Used by CI and locally.
# Exits non-zero if any suite fails.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

pass=0
fail=0
failed_list=()

# Build the shared core lib first (TS services depend on its dist/).
echo "== building @abetworks/core =="
( cd niche-plans/00-platform-baseline/packages/core && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) \
  && echo "core built" || { echo "core build FAILED"; exit 1; }

# TypeScript services: any dir with a package.json under scaffolding/services + the core lib.
echo "== TypeScript services =="
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  name="${dir#niche-plans/}"
  if ( cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && npm test >/dev/null 2>&1 ); then
    echo "PASS  $name"; pass=$((pass + 1))
  else
    echo "FAIL  $name"; fail=$((fail + 1)); failed_list+=("$name")
  fi
done < <(git ls-files 'niche-plans/**/scaffolding/services/*/package.json')

# Python services: any dir with a pyproject.toml under scaffolding/services.
echo "== Python services =="
while IFS= read -r proj; do
  dir="$(dirname "$proj")"
  name="${dir#niche-plans/}"
  if ( cd "$dir" && uv venv >/dev/null 2>&1; uv pip install -q -e ".[dev]" >/dev/null 2>&1 && uv run pytest -q >/dev/null 2>&1 ); then
    echo "PASS  $name"; pass=$((pass + 1))
  else
    echo "FAIL  $name"; fail=$((fail + 1)); failed_list+=("$name")
  fi
done < <(git ls-files 'niche-plans/**/scaffolding/services/*/pyproject.toml')

echo "=================================="
echo "SUITES: pass=$pass fail=$fail"
if [ "$fail" -ne 0 ]; then
  printf 'FAILED: %s\n' "${failed_list[@]}"
  exit 1
fi
echo "ALL SUITES GREEN"
