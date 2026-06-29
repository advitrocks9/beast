#!/usr/bin/env bash
# Fail the build if any em-dash (U+2014) appears in tracked source files.
# Hyphens (U+002D) and en-dashes (U+2013) are fine.
# Excludes: node_modules, dist, .next, build artifacts, lockfiles.

set -euo pipefail

EM_DASH=$(printf '\xe2\x80\x94')
ROOT="$(git rev-parse --show-toplevel)"

cd "$ROOT"

# Search tracked source-ish files only. Includes .env.example and similar
# template files so env-var taglines never carry an em-dash.
HITS=$(git ls-files \
  '*.ts' '*.tsx' '*.js' '*.jsx' '*.md' '*.mdx' '*.json' '*.yaml' '*.yml' '*.css' \
  '.env.example' '.env.template' '.env.sample' \
  | grep -v -E '(^|/)(node_modules|\.next|dist|build|coverage|\.turbo)/' \
  | grep -v -E '(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$' \
  | xargs -I{} grep -l "$EM_DASH" {} 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "em-dash (U+2014) found in tracked files:"
  echo "$HITS" | sed 's/^/  /'
  echo ""
  echo "Replace with hyphen, comma, semicolon, or rephrase."
  echo "Hard rule for this repo."
  exit 1
fi

echo "ok no em-dashes in tracked files"
