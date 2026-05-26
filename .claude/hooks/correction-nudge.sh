#!/usr/bin/env bash
# Hook 5: UserPromptSubmit — detect correction signals from user, remind to
# write a feedback memory entry. Soft injection (stdout goes to Claude as
# additional context for the current turn).

PROMPT=$(jq -r '.prompt // empty' 2>/dev/null | tr '[:upper:]' '[:lower:]')
[ -z "$PROMPT" ] && exit 0

# Correction signals (RU+EN)
if echo "$PROMPT" | grep -qE '(нет(\s|,|\.|!)|не\s+делай|стоп|переделай|неправильно|опять\s+врё|срезал|не\s+пользуешь|не\s+понял|плохо\s+сделал|снова\s+ту[пп]|halt|stop[[:space:]]+doing|wrong|nope|undo\s+that|that.s\s+wrong)'; then
  echo "📝 USER CORRECTION DETECTED — once resolved, consider writing a feedback memory entry to ~/.claude/projects/E--VPN/memory/ (lead with **Why:** and **How to apply:**). See auto-memory rules in system prompt."
fi

exit 0
