#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0

echo "==> Checking for tracked secret files..."
while IFS= read -r pattern; do
  [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue
  if git ls-files --error-unmatch $pattern >/dev/null 2>&1; then
    echo "BLOCKED: tracked file matches $pattern"
    fail=1
  fi
done <<'EOF'
.env
.env.*
backend/firebase-service-account.json
*firebase-service-account.json*
*credentials.json*
*token.json*
EOF

echo "==> Scanning staged diff for common secret markers..."
if git diff --cached -U0 | grep -E 'AKIA[0-9A-Z]{16}|eyJhbGciOi|SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^$\s]|AWS_SECRET_ACCESS_KEY\s*=\s*[^$\s]|private_key"' >/dev/null; then
  echo "BLOCKED: staged changes look like they contain secrets"
  fail=1
fi

echo "==> Ensuring env templates are not ignored..."
for f in .env.example frontend/.env.example; do
  if [[ -f "$f" ]] && git check-ignore -q "$f"; then
    echo "BLOCKED: $f is gitignored but should be committed"
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "Fix the issues above before pushing."
  exit 1
fi

echo "OK: no obvious secrets detected."
