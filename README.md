# Claude Meter

*Made by [Bon Yeung](https://github.com/bonyuiux)*

A small pixel widget that floats over your desktop and shows how much of your Claude plan is left and when it refills.
It has a "Loud Retro" look: dark with acid lime, pixel type and hard shadows.

## Install

You need a Mac (macOS 13 or later) and Claude Code. The `/sync-meter` command uses the Claude desktop app's Code tab.

1. Download this project: the green **Code** button → **Download ZIP**, then unzip it.
2. Open **Terminal**, type `cd ` (with a space), drag the unzipped folder into the Terminal window, and press Return.
3. Run:
   ```bash
   ./install.sh
   ```
   If it asks for Apple's Command Line Tools, run `xcode-select --install`, wait for it to finish, then run `./install.sh` again.

The installer builds the app on your Mac and puts it in Applications. It also adds the `/sync-meter` command and the status-bubble hooks to Claude Code, without touching your other settings. The meter starts straight away.

- **Launch it later:** open **Claude Meter** from Applications, Spotlight or Launchpad.
- **Start it automatically:** right-click the meter → **Open at login**.
- **First sync:** in a Claude Code chat, type `/sync-meter` so the meter knows your exact numbers.
- **Remove it:** turn off Open at login, then run `./uninstall.sh` from the same folder.

## How to read it

- **Big number:** how much of your 5-hour limit is left.
- **Resets in:** a live countdown, plus the clock time it refills.
- **The lane is a race to the reset:**
  - **Clawd** (the orange Claude Code character) runs from the start towards the **flag** as time passes. When he reaches the flag, your limit resets.
  - **A fire chases him.** The fire is what you've burned so far.
  - If the fire stays behind Clawd, you'll make it to the reset. If it gets close, he sweats. If it catches him, you're using Claude faster than time is passing and will run out early. The big number turns pink.
  - When you're out, the whole lane is on fire until the reset. Before a window starts, Clawd naps at the starting line.
- **Weekly limit:** a plain bar. The lime fill is what you've used. The right end is the limit, which resets at the time shown underneath.
- **Mini size** keeps a small "Resets in" label above the countdown.

## Status bubble

A small bubble pops out above the meter (or below it, if the meter sits at the top of the screen) to show what Claude is doing:

- **Thinking…** while Claude works on your prompt.
- **Done!** with Clawd cheering, for a few seconds when it finishes.
- **Needs you** when Claude is waiting for a permission.

It works through Claude Code hooks in `~/.claude/settings.json` (UserPromptSubmit, PostToolUse, Stop, StopFailure, SessionEnd and Notification). They run `~/.claude-meter/hook.sh`, which writes a tiny status file the meter reads. To turn the bubble off, delete those hook entries (or run `./uninstall.sh`).

## Using it

- **Move it:** drag it anywhere. It remembers the spot and stays on top on every desktop.
- **Mini size:** click the small square button. Click it again to go back to full size. It grows away from the nearest screen edge, so it never ends up half off screen.
- **Right-click** for the theme (dark, light or match macOS), entering numbers, Open at login, refreshing and quitting.
- **Click the lane** and Clawd hops.

## Keeping it accurate

The widget counts the tokens Claude Code writes to its local logs, so it updates on its own every 15 seconds.
It can't see your exact plan numbers by itself, so sync it now and then:

- In any Claude Code chat in the Claude app, type **/sync-meter**. Claude reads your real usage and updates the widget.
- Or right-click → **Enter numbers from Claude's usage card…** and type in the two percentages.

Each sync also teaches the widget how fast you burn, so its estimates get better over time.
Chats on claude.ai and the phone app also count towards your limit but aren't in the logs, so syncing corrects for them.

## Files

| File | What it is |
|---|---|
| `Meter.swift` | The Mac window and the maths: reading logs, estimating and syncing. |
| `ui/index.html`, `ui/meter.css`, `ui/meter.js` | What you see: the layout, colours and pixel characters. |
| `ui/bubble.html`, `ui/bubble.js` | The pop-out status bubble. |
| `hooks/claude-meter-hook.sh` | The hook script. build.sh installs it to `~/.claude-meter/hook.sh`. |
| `install.sh` / `uninstall.sh` | One-step setup and removal. |
| `build.sh` | Rebuilds the app after a change (run `./install.sh` again to update the copy in Applications). |
| `skills/sync-meter/SKILL.md` | The /sync-meter instructions Claude follows. The installer copies it to `~/.claude/skills/`. |
| `~/.claude-meter/sync.json` | The last exact numbers, written by /sync-meter. |

To preview the face in a browser with fake data, open `ui/index.html` and add `?state=ok`, `close`, `warn`, `out` or `idle` (plus `&theme=light` or `&mini=1`) to the address.

## Good to know

- **It only reads files on your own Mac** (Claude Code's logs and its own small files in `~/.claude-meter`). It never sends anything anywhere.
- **The numbers between syncs are estimates.** They start from rough Pro-plan figures and adjust to your own usage after a couple of syncs.
- **Unofficial:** this is a fan-made tool and isn't made or endorsed by Anthropic.

## Credits

Designed and made by **[Bon Yeung](https://github.com/bonyuiux)**. Copyright © 2026 Bon Yeung. If you share or remix it, please keep this credit.
