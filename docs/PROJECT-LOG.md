# Project log — Claude Meter

> **Agents: read this first.** It says what exists, where it lives, and what is left to do. Update it when you make significant changes (newest entry first in "Log").

## What this is

An unofficial fan project (not made by Anthropic): a floating pixel meter for macOS that shows how much Claude usage is left, live, for chat and Claude Code. Free and open source. Swift shell (`Meter.swift`) + HTML/CSS/JS face (`ui/`). By Bon Yeung (github.com/bonyuiux).

## Where things are

| Thing | Location |
|---|---|
| App source | `Meter.swift`, `ui/`, `hooks/`, `skills/sync-meter`, `build.sh`, `install.sh` |
| Promo video source (HTML + JS + Swift renderer) | `Claude Meter Promo/` (`render.sh` exports 1080x1350, 30 fps, H.264; about a minute) |
| Promo video, **master** (29 MB, not in git) | Regenerate with `Claude Meter Promo/render.sh`. A near-lossless 1080x1350 encode (4.7 MB) is on Google Drive, account bonyuiux@gmail.com, My Drive root: `claude-meter-promo-1080x1350-hq.mp4`, https://drive.google.com/file/d/1y9xSanMSyjhAANAs4HgWCt-SyA-fkpJb/view (private to that account) |
| Case-study visuals (loops + stills for the portfolio) | `Claude Meter Case Study/assets/` |
| Script that renders those visuals from the real widget code | `Claude Meter Case Study/render/render.mjs` (Playwright + ffmpeg; paths are the owner's Mac paths, edit `UI`, `OUT`, `FF` at the top; Playwright was borrowed from another project's `node_modules`) |
| Portfolio case study (live) | https://www.bonyuiux.work/ai-experiment/claude-meter, source in repo `bonyuiux/bon-portfolio` (`ClaudeMeterPage.tsx`), see that repo's `docs/PROJECT-LOG.md` |

## Log (newest first)

### 2026-10-16 — Case study visuals and backup
- Rendered the four feature visuals (live usage, race, thinking/done bubble, mini strip) as 1200x900 loops + stills from `ui/index.html` and `ui/bubble.html` (dark ink `#0B0A12` world, 2x, pixelated). They are published in the portfolio repo under `public/images/claude-meter/`.
- The hero video on the portfolio is a 4:5 web encode of the promo (about 2.5 MB, H.264). The promo's first frame is black, so the poster is the frame at 3 s.
- Committed the promo source, case-study assets and render script here. The 29 MB master is intentionally not in git (see table).

### Earlier
- `0e6d7a0` live usage for all of Claude, plus a sync button · `7561611` Claude chat status, several chats at once · `203485a` first version.

## Open items

1. The owner will rewrite the case-study copy elsewhere and bring it back; the text lives inline in the portfolio repo's `ClaudeMeterPage.tsx`.
2. Optional: add real captured screen footage (static mock desktop is used for Feature 04).
