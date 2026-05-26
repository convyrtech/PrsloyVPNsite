#!/usr/bin/env bash
# Hook 2: PreToolUse on Bash — block destructive commands.
# Returns exit 2 to deny: rm -rf /, git push --force, git reset --hard,
# vercel --prod (per CLAUDE.md §10: manual deploy is user's call).

CMD=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$CMD" ] && exit 0

# Strip leading whitespace for matching
TRIMMED=$(echo "$CMD" | sed -E 's/^[[:space:]]+//')

if echo "$TRIMMED" | grep -qE '(^|[^a-zA-Z])rm[[:space:]]+-(rf|fr)[[:space:]]+/([[:space:]]|$)'; then
  echo "⛔ Blocked: rm -rf on root path. Specify a narrower target." >&2
  exit 2
fi

if echo "$TRIMMED" | grep -qE 'git[[:space:]]+push[[:space:]]+.*(--force|-f)([[:space:]]|$)'; then
  echo "⛔ Blocked: git push --force needs manual user execution. Use ! prefix." >&2
  exit 2
fi

if echo "$TRIMMED" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard'; then
  echo "⛔ Blocked: git reset --hard is destructive. Use ! prefix for manual run." >&2
  exit 2
fi

if echo "$TRIMMED" | grep -qE 'vercel[[:space:]]+.*--prod'; then
  echo "⛔ Blocked: deploy is user's manual action (CLAUDE.md §10). User runs vercel --prod themselves." >&2
  exit 2
fi

if echo "$TRIMMED" | grep -qE 'git[[:space:]]+branch[[:space:]]+-D[[:space:]]+main'; then
  echo "⛔ Blocked: cannot delete main branch." >&2
  exit 2
fi

exit 0
