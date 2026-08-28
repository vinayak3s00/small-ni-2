#!/usr/bin/env bash
# Abetworks — run every service test suite (TS + Python). Used by CI and locally.
# Exits non-zero if any suite fails.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

pass=0
fail=0
failed_list=()

# Build AND test the shared core lib first (every TS service depends on it, so
# its own suite must run — not just build).
echo "== @abetworks/core (build + test) =="
if ( cd niche-plans/00-platform-baseline/packages/core \
      && npm install --no-audit --no-fund >/dev/null 2>&1 \
      && npm run build >/dev/null 2>&1 \
      && npm test >/dev/null 2>&1 ); then
  echo "PASS  00-platform-baseline/packages/core"; pass=$((pass + 1))
else
  echo "FAIL  00-platform-baseline/packages/core"; fail=$((fail + 1)); failed_list+=("@abetworks/core")
fi

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

# Platform TypeScript packages (e.g. billing) — standalone, no core dependency.
echo "== Platform packages =="
while IFS= read -r pkg; do
  dir="$(dirname "$pkg")"
  name="${dir}"
  if ( cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1 && npm test >/dev/null 2>&1 ); then
    echo "PASS  $name"; pass=$((pass + 1))
  else
    echo "FAIL  $name"; fail=$((fail + 1)); failed_list+=("$name")
  fi
done < <(git ls-files 'platform/**/package.json')

echo "=================================="
echo "SUITES: pass=$pass fail=$fail"
if [ "$fail" -ne 0 ]; then
  printf 'FAILED: %s\n' "${failed_list[@]}"
  exit 1
fi
echo "ALL SUITES GREEN"
