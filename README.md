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

- **Thinking…** while Claude works, in Claude Code and in Claude chat. When several are busy at once it shows a count, like **×2**.
- **Done!** with Clawd cheering, for a few seconds when one finishes. A small label says which one: **Chat** or the project's folder name.
- **Needs you** when Claude Code is waiting for a permission. This one always shows first.

**Claude Code** status comes from hooks in `~/.claude/settings.json`, which run `~/.claude-meter/hook.sh`.

**Claude chat** has no hooks, so the meter watches the Claude desktop app for its **Stop response** button, the same way you would. That needs one switch:

1. Right-click the meter and choose **Show Claude chat status**, then **Open System Settings**.
2. Under **Privacy & Security → Accessibility**, switch **Claude Meter** on.

The meter only reads button names, never your messages. If you switch to another conversation while a reply is still being written, the meter can't tell whether it finished, so it shows nothing rather than a false "Done!". After updating Claude Meter, switch it off and on again in Accessibility, because macOS treats each new build as a new app.

To turn the bubble off for Claude Code, delete the hook entries (or run `./uninstall.sh`). For chat, untick **Show Claude chat status** in the right-click menu.

## Using it

- **Move it:** drag it anywhere. It remembers the spot and stays on top on every desktop.
- **Mini size:** click the small square button. Click it again to go back to full size. It grows away from the nearest screen edge, so it never ends up half off screen.
- **Right-click** for the theme (dark, light or match macOS), entering numbers, Open at login, refreshing and quitting.
- **Click the lane** and Clawd hops.

## Live numbers (recommended)

The meter can show your exact usage for all of Claude (chats, Claude Code, everything) the same numbers as Claude's Usage page, refreshed every minute. The footer then shows **● LIVE · updated 20s ago**, also in mini size.

It needs a Claude Code sign-in on your Mac, once:

```bash
claude auth login
```

(If you don't have Claude Code installed in Terminal, the installer's private copy works too: `~/.claude-meter/cli/node_modules/.bin/claude auth login`.)

- **Sync button** (the ↻ next to the size button) fetches right away.
- The meter renews the sign-in by itself, exactly the way Claude Code does, so you never need to log in again.
- If live numbers ever stop (no internet, signed out), the footer turns pink: **NOT LIVE**. A stale number never passes for a real one.

Without a sign-in, the meter falls back to estimating from Claude Code's local logs, and `/sync-meter` in a Claude Code chat sets the exact numbers. The estimate cannot see chat usage, so live mode is the way to go.

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
