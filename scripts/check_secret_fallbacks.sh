#!/usr/bin/env bash
# Abetworks — insecure-secret-fallback guard.
# Fails (exit 1) if any tracked non-test TS source file reintroduces a
# hardcoded secret fallback: reading a secret-bearing env var directly off
# `process.env` with a quoted string-literal default, e.g.
#   process.env.JWT_SECRET ?? 'dev-secret-change-me'
#   process.env.WA_APP_SECRET || 'changeme'
# Secrets must be resolved via requireSecret(...) from @abetworks/core instead.
#
# Detection scope (broadened from the original `?? 'dev-...'`-only pattern):
#   • matches BOTH `??` (nullish coalescing) AND `||` (logical-or) fallbacks;
#   • matches ANY quoted string literal default (`'...'` or "..."), not only a
#     `dev-` prefixed one, so non-`dev-` constants like 'changeme' are caught;
#   • only flags env vars whose NAME looks secret-bearing — it contains one of
#     SECRET / TOKEN / KEY / PASSWORD / PASS / CREDENTIAL (env names are
#     uppercase). This deliberately leaves legitimate non-secret env defaults
#     alone, e.g. `process.env.PORT ?? 3011` (numeric, not a secret),
#     `process.env.APP_RLS_ROLE ?? 'app_rls'` (a DB role name),
#     `process.env.LOG_LEVEL ?? 'info'`, `process.env.HOST ?? '0.0.0.0'`.
#
# Limitation: this is a single-line grep, so a fallback deliberately split
# across two physical lines is not detected. Multi-line detection in bash is
# fragile and prone to false positives; the priority is a robust single-line
# rule covering `??`/`||` + any string literal, which is what this implements.
# Intended for CI. Run from anywhere inside the repo.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Insecure pattern: a secret-bearing env var read directly off process.env with
# a `??`/`||` quoted-string-literal fallback. The env NAME must contain one of
# the secret-indicating substrings for a line to be flagged.
PATTERN="process\.env\.[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD|PASS|CREDENTIAL)[A-Z_]* *(\?\?|\|\|) *['\"]"
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
  echo "FAIL: $violations insecure secret fallback(s) found. Use requireSecret(...) from @abetworks/core instead of a hardcoded process.env.<SECRET> ?? / || '...' default."
  exit 1
fi
echo "OK: no insecure secret fallbacks found"
