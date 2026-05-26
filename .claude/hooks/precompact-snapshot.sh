#!/usr/bin/env bash
# Hook 6: PreCompact — save mid-task state to ~/.gstack/sessions/<id>.md
# so context can be re-anchored after compaction. Snapshot includes:
#   - current branch + ahead/behind
#   - last 5 commits
#   - git status (working tree)
#   - last 3 active tasks (best-effort)

SID=$(jq -r '.session_id // "unknown"' 2>/dev/null)
CWD=$(jq -r '.cwd // "."' 2>/dev/null)
mkdir -p ~/.gstack/sessions

OUT=~/.gstack/sessions/"$SID"-precompact.md
cd "$CWD" || exit 0

{
  echo "# Pre-compact snapshot — session $SID"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "CWD: $CWD"
  echo ""
  echo "## Branch + position"
  BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
  echo "- Branch: $BRANCH"
  AHEAD=$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo "n/a")
  echo "- vs origin/main (behind ahead): $AHEAD"
  echo ""
  echo "## Last 5 commits"
  git log --oneline -5 2>/dev/null || echo "(no commits)"
  echo ""
  echo "## Working tree"
  git status --short 2>/dev/null | head -20
  echo ""
  echo "## Untracked"
  git ls-files --others --exclude-standard 2>/dev/null | head -10
} > "$OUT" 2>/dev/null

echo "Pre-compact snapshot saved → $OUT"
exit 0
