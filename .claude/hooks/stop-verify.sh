#!/usr/bin/env bash
# Hook 4: Stop hook — if any src/ TS files changed in working tree, run
# typecheck + affected tests. Output goes to Claude as next-turn context.
# Soft hook (no exit 2 here, but stderr lands as additional context).

cd "$(jq -r '.cwd // "."' 2>/dev/null)" || exit 0

CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E 'src/(lib|app|components|server|i18n)/.*\.(ts|tsx)$' || true)
[ -z "$CHANGED" ] && exit 0

# Quick typecheck (fast, ~3s)
TC=$(npm run typecheck 2>&1 | tail -3)
if echo "$TC" | grep -qiE "error|TS[0-9]+"; then
  echo "⚠ TypeScript errors detected after src/ edits:" >&2
  echo "$TC" >&2
fi

# Affected tests via --changed
TS=$(npx vitest run --changed 2>&1 | tail -5)
if echo "$TS" | grep -qiE "fail|error|✘"; then
  echo "⚠ Tests FAILED after src/ edits:" >&2
  echo "$TS" >&2
fi

exit 0
