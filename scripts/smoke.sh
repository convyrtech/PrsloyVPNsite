#!/usr/bin/env bash
# PRSLOY route smoke-test. Hits every locale route + public read APIs, asserts
# status + a stable text marker, and flags WAF challenges distinctly from outages.
#
#   scripts/smoke.sh http://localhost:3000       # trustworthy gate — no WAF
#   scripts/smoke.sh https://www.prsloy.online   # best-effort — WAF-CHALLENGE (exit 2) is expected, not a failure
#
# localePrefix is "always", so every page lives at /{ru|en}/…
set -u
BASE="${1:?usage: smoke.sh BASE_URL}"
UA='prsloy-smoke/1'
FAIL=0
WAF=0

check () { # $1=path  $2=expected_status  $3=marker (grep -i, empty to skip)
  local path="$1" want="$2" marker="${3:-}"
  local body code
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' -A "$UA" "$BASE$path")"
  if grep -Eqi 'Vercel Security Checkpoint|_vercel/security|challenge-platform|Just a moment|Код 21' "$body"; then
    echo "WAF-CHALLENGE  $path  ($code)"; WAF=1; rm -f "$body"; return
  fi
  if [ "$code" != "$want" ]; then
    echo "FAIL  $path  status=$code want=$want"; FAIL=1; rm -f "$body"; return
  fi
  if [ -n "$marker" ] && ! grep -qi "$marker" "$body"; then
    echo "FAIL  $path  marker missing: $marker"; FAIL=1; rm -f "$body"; return
  fi
  echo "OK    $path  ($code)"
  rm -f "$body"
}

for L in ru en; do
  check "/$L"           200
  check "/$L/pricing"   200 "pricing"
  check "/$L/login"     200
  check "/$L/register"  200
  check "/$L/dashboard" 200 "PRSLOY ID"
  check "/$L/setup"     200
  check "/$L/faq"       200
  check "/$L/blog"      200
  check "/$L/privacy"   200
  check "/$L/terms"     200
  check "/$L/refunds"   200
done

# admin/grant returns 404 when ADMIN_SECRET is unset — assert that, not 200.
check "/ru/admin/grant" 404

# public JSON read APIs (guest)
if curl -sS -A "$UA" "$BASE/api/access/capacity" | grep -q '"ok"'; then
  echo "OK    /api/access/capacity"
else
  echo "FAIL  /api/access/capacity"; FAIL=1
fi
if curl -sS -A "$UA" "$BASE/api/auth/me" | grep -q '"user":null'; then
  echo "OK    /api/auth/me (guest)"
else
  echo "NOTE  /api/auth/me not guest-null (logged in?)"
fi

if [ "$WAF" = 1 ]; then
  echo "— WAF challenge seen (expected on prod, not a failure)"
  exit 2
fi
if [ "$FAIL" = 1 ]; then
  echo "— smoke FAILED"
  exit 1
fi
echo "all green"
exit 0
