#!/usr/bin/env bash
# Hook 7: SessionStart (resume + startup) — inject project state so Claude
# doesn't have to re-discover via Bash commands. Output goes to additional
# context for the first turn.

SOURCE=$(jq -r '.source // "startup"' 2>/dev/null)
CWD=$(jq -r '.cwd // "."' 2>/dev/null)
cd "$CWD" || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
AHEAD_BEHIND=$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null)
LAST=$(git log --oneline -3 2>/dev/null)
STATUS=$(git status --short 2>/dev/null | head -5)

echo "## Project state at $SOURCE"
echo ""
echo "**Branch:** \`$BRANCH\`"
[ -n "$AHEAD_BEHIND" ] && echo "**vs origin/main (behind ahead):** $AHEAD_BEHIND"
echo ""
echo "**Last 3 commits:**"
echo '```'
echo "$LAST"
echo '```'
echo ""
if [ -n "$STATUS" ]; then
  echo "**Working tree:**"
  echo '```'
  echo "$STATUS"
  echo '```'
else
  echo "**Working tree:** clean"
fi
echo ""

# Pre-compact snapshot recovery
LATEST_SNAP=$(ls -t ~/.gstack/sessions/*-precompact.md 2>/dev/null | head -1)
if [ -n "$LATEST_SNAP" ] && [ "$SOURCE" = "resume" ]; then
  echo "**Recent pre-compact snapshot available:** \`$LATEST_SNAP\` (read if mid-task)"
  echo ""
fi

# TODOS reminder — count active workstream items (P0/P1/P2 in new format)
if [ -f TODOS.md ]; then
  P0=$(grep -c '^\*\*Priority:\*\* P0' TODOS.md 2>/dev/null)
  P1=$(grep -c '^\*\*Priority:\*\* P1' TODOS.md 2>/dev/null)
  P2=$(grep -c '^\*\*Priority:\*\* P2' TODOS.md 2>/dev/null)
  echo "**Open TODOs:** P0=$P0  P1=$P1  P2=$P2"
fi

exit 0
