#!/usr/bin/env bash
# Abetworks — insecure-secret-fallback guard.
# Fails (exit 1) if any tracked non-test TS source file reintroduces a
# hardcoded secret fallback of the form `process.env.<NAME> ?? 'dev-...'`.
# Secrets must be resolved via requireSecret(...) from @abetworks/core instead.
# Intended for CI. Run from anywhere inside the repo.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Insecure pattern: reading an env secret with a hardcoded 'dev-...' default.
PATTERN="process\.env\.[A-Z_]+ *\?\? *['\"]dev-"
violations=0
checked=0

while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.test.ts) continue ;;
  esac
  checked=$((checked + 1))
  while IFS= read -r hit; do
    echo "INSECURE FALLBACK: $f:$hit"
    violations=$((violations + 1))
  done < <(grep -nE "$PATTERN" "$f" | cut -d: -f1)
# Use `:(glob)` pathspec magic so that `**` matches across directory
# boundaries (git's default pathspec globbing treats `*`/`**` as non-recursive).
done < <(git ls-files \
  ':(glob)niche-plans/**/scaffolding/services/*/src/**/*.ts' \
  ':(glob)niche-plans/00-platform-baseline/packages/core/src/**/*.ts' \
  ':(glob)platform/**/*.ts')

echo "checked $checked file(s), $violations insecure fallback(s)"
if [ "$violations" -ne 0 ]; then
  echo "FAIL: $violations insecure secret fallback(s) found. Use requireSecret(...) from @abetworks/core instead of process.env.<NAME> ?? 'dev-...'."
  exit 1
fi
echo "OK: no insecure secret fallbacks found"
