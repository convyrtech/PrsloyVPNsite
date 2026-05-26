#!/usr/bin/env bash
# Hook 3: PreToolUse on Bash matching `git commit` — scan staged diff for secrets.
# Exit 2 if a recognizable secret pattern appears in the staged change.

CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$CMD" ] && exit 0

echo "$CMD" | grep -q 'git[[:space:]]\+commit' || exit 0

cd "$(jq -r '.cwd // "."' 2>/dev/null)" || exit 0

# Scan staged diff lines (added side) for secret-looking patterns.
# Matches if a token-like value follows a known key.
DIFF=$(git diff --cached --unified=0 2>/dev/null | grep -E '^\+[^+]' || true)
[ -z "$DIFF" ] && exit 0

HIT=$(echo "$DIFF" | grep -E "(TELEGRAM_BOT_TOKEN|RESEND_API_KEY|UPSTASH_REDIS_REST_TOKEN|PLATEGA_SECRET_KEY|AUTH_SECRET|TELEGRAM_WEBHOOK_SECRET)[[:space:]]*=[[:space:]]*['\"]?[A-Za-z0-9_:-]{12,}" || true)

# Provider-format tokens
HIT2=$(echo "$DIFF" | grep -oE "(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{40,}|[0-9]{8,12}:AAE[a-zA-Z0-9_-]{30,})" | head -3 || true)

if [ -n "$HIT" ] || [ -n "$HIT2" ]; then
  echo "⛔ Possible secret in staged diff. Inspect via 'git diff --cached' before committing." >&2
  [ -n "$HIT" ] && echo "  pattern: $(echo "$HIT" | head -1 | cut -c1-80)..." >&2
  [ -n "$HIT2" ] && echo "  token-like: $(echo "$HIT2" | head -1)" >&2
  exit 2
fi

exit 0
