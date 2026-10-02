---
name: sync-meter
description: Sync the Claude Meter desktop widget with the exact plan usage (5-hour and weekly limits). Use when the user types /sync-meter or says "sync my meter" / "sync the meter".
---

# Sync Claude Meter

The Claude Meter widget estimates usage from local logs and needs the exact
numbers now and then. Do this quickly and quietly:

1. Call `mcp__ccd_session_mgmt__get_usage` (load it with ToolSearch `select:mcp__ccd_session_mgmt__get_usage` if it is deferred).
2. From `plan.windows`, map the label "5-hour limit" to kind `session` and "Weekly · all models" to kind `weekly`.
   Ignore other windows.
3. Write `~/.claude-meter/sync.json` (overwrite it) in exactly this shape, with `syncedAt` = the current UTC time:

```json
{
  "plan": "<plan.plan>",
  "source": "claude",
  "syncedAt": "2026-01-01T00:00:00.000Z",
  "windows": [
    { "kind": "session", "percentUsed": 13, "resetsAt": "<resetsAt from get_usage>" },
    { "kind": "weekly",  "percentUsed": 41, "resetsAt": "<resetsAt from get_usage>" }
  ]
}
```

4. Reply in one short line, e.g. "Meter synced: 13% of your 5-hour limit used (resets 11:20 PM), 41% of the week."

If `plan.status` is not "ok", don't write the file; tell the user the usage couldn't be read right now.
