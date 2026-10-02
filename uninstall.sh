#!/bin/zsh
# Removes Claude Meter, its /sync-meter command and its hooks. Run:  ./uninstall.sh
# Tip: turn off "Open at login" in the meter's right-click menu first.
pkill -f "Claude Meter.app/Contents/MacOS/ClaudeMeter" 2>/dev/null || true
rm -rf "/Applications/Claude Meter.app" "$HOME/Applications/Claude Meter.app"
rm -rf "$HOME/.claude/skills/sync-meter" "$HOME/.claude-meter"
python3 - <<'PY'
import json, os
path = os.path.expanduser("~/.claude/settings.json")
if os.path.exists(path):
    s = json.load(open(path))
    hooks = s.get("hooks", {})
    for event in list(hooks):
        hooks[event] = [g for g in hooks[event]
                        if not any("claude-meter/hook.sh" in h.get("command", "") for h in g.get("hooks", []))]
        if not hooks[event]: del hooks[event]
    if not hooks: s.pop("hooks", None)
    json.dump(s, open(path, "w"), indent=2)
PY
defaults delete local.bon.claude-meter 2>/dev/null || true
echo "Claude Meter is removed."
