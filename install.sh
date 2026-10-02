#!/bin/zsh
# One-step setup for Claude Meter. Run in Terminal from this folder:  ./install.sh
# 1. builds the app and puts it in Applications
# 2. adds the /sync-meter command to Claude Code
# 3. adds the hooks that feed the status bubble (Thinking… / Done! / Needs you)
set -e
cd "$(dirname "$0")"

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Claude Meter needs Apple's free Command Line Tools to build."
  echo "Run:  xcode-select --install   then run ./install.sh again."
  exit 1
fi

./build.sh
pkill -f "Claude Meter.app/Contents/MacOS/ClaudeMeter" 2>/dev/null || true

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
rm -rf "$DEST/Claude Meter.app"
cp -R "Claude Meter.app" "$DEST/"
echo "Installed the app in $DEST"

mkdir -p "$HOME/.claude/skills/sync-meter"
cp skills/sync-meter/SKILL.md "$HOME/.claude/skills/sync-meter/SKILL.md"
echo "Added the /sync-meter command"

# Merge the hooks into ~/.claude/settings.json, keeping everything already there.
python3 - <<'PY'
import json, os
path = os.path.expanduser("~/.claude/settings.json")
settings = json.load(open(path)) if os.path.exists(path) else {}
hooks = settings.setdefault("hooks", {})
events = {"UserPromptSubmit": "working", "PostToolUse": "working", "Stop": "done",
          "StopFailure": "idle", "SessionEnd": "idle", "Notification": "notify"}
for event, arg in events.items():
    groups = hooks.setdefault(event, [])
    if any("claude-meter/hook.sh" in h.get("command", "") for g in groups for h in g.get("hooks", [])):
        continue   # already installed
    groups.append({"hooks": [{"type": "command", "command": f'sh "$HOME/.claude-meter/hook.sh" {arg}',
                              "async": True, "timeout": 5}]})
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(settings, open(path, "w"), indent=2)
print("Added the status-bubble hooks to ~/.claude/settings.json")
PY

open "$DEST/Claude Meter.app"
echo "Done. Claude Meter is running. Right-click it for options, including Open at login."
