#!/usr/bin/env bash
# Abetworks — lint / type-check gate for every service (TS + Python).
# TS services are type-checked with `tsc --noEmit`; Python services are linted
# with a single shared Ruff config (ruff.toml at the repo root).
# Exits non-zero if any check fails. Used by CI and locally.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

pass=0
fail=0
failed_list=()

# Ruff runner: prefer a ruff on PATH, else fall back to `uvx ruff` (no install).
run_ruff() {
  if command -v ruff >/dev/null 2>&1; then
    ruff "$@"
  else
    uvx ruff "$@"
  fi
}

# Build the shared core lib first so TS services can type-check against its dist/.
echo "== building @abetworks/core =="
( cd niche-plans/00-platform-baseline/packages/core && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) \
  && echo "core built" || { echo "core build FAILED"; exit 1; }

# TypeScript: type-check the core lib + every service (tsc --noEmit, no test run).
echo "== TypeScript type-check =="
ts_dirs=("niche-plans/00-platform-baseline/packages/core")
while IFS= read -r pkg; do ts_dirs+=("$(dirname "$pkg")"); done \
  < <(git ls-files 'niche-plans/**/scaffolding/services/*/package.json')

for dir in "${ts_dirs[@]}"; do
  name="${dir#niche-plans/}"
  if ( cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run lint >/dev/null 2>&1 ); then
    echo "PASS  $name"; pass=$((pass + 1))
  else
    echo "FAIL  $name"; fail=$((fail + 1)); failed_list+=("ts:$name")
  fi
done

# Python: a single Ruff pass over all service source (shared ruff.toml).
echo "== Python lint (ruff) =="
if run_ruff check niche-plans/ >/dev/null 2>&1; then
  echo "PASS  ruff (all python services)"; pass=$((pass + 1))
else
  echo "FAIL  ruff — details below:"; run_ruff check niche-plans/
  fail=$((fail + 1)); failed_list+=("py:ruff")
fi

echo "=================================="
echo "LINT CHECKS: pass=$pass fail=$fail"
if [ "$fail" -ne 0 ]; then
  printf 'FAILED: %s\n' "${failed_list[@]}"
  exit 1
fi
echo "ALL LINT CHECKS GREEN"
