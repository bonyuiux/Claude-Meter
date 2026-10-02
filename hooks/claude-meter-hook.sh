#!/bin/sh
# Claude Code hook → tells Claude Meter what Claude is doing right now.
# Usage: hook.sh working | done | idle | notify     (Claude Code pipes the event JSON on stdin)
# Writes one tiny file per chat session to ~/.claude-meter/activity/<session>.json.
# build.sh installs this to ~/.claude-meter/hook.sh, which ~/.claude/settings.json points at.
dir="$HOME/.claude-meter/activity"
mkdir -p "$dir"
input=$(cat)
sid=$(printf '%s' "$input" | sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' | head -n 1)
[ -n "$sid" ] || sid=unknown
state="$1"
if [ "$state" = notify ]; then
  # Only permission requests need you. The "waiting for your input" nudge after a finished task doesn't.
  printf '%s' "$input" | grep -qi 'permission' || exit 0
  state=waiting
fi
printf '{"state":"%s","at":%s}\n' "$state" "$(date +%s)" > "$dir/$sid.json"
exit 0
