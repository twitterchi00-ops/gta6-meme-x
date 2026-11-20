[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/twitterchi00-ops/gta6-meme-x/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/twitterchi00-ops/gta6-meme-x/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

# GTA 6 meme — make.fun bounty `gta6-meme-x-01`

A code-rendered GTA VI launch-week meme for the make.fun bounty
**"Post a GTA 6 meme on X"** — https://make.fun/bounty/gta6-meme-x-01

- **Prize:** $500 shared by the top 50 (1st $100, 2nd $60, 3rd $30,
  4th–10th $10 each, 11th–50th $6 each).
- **Deadline:** Mon 23 Nov 2026, 17:30 Tehran (14:00 UTC).
- **Opened:** Wed 19 Nov 2026, 17:30 Tehran (14:00 UTC).
- **Entry fee:** free. No paid API, no paid tool, no deposit.

## The joke

One sharp contrast, written right into the picture:

> **WAITED 13 YEARS FOR GTA VI**
> **MY AGENT ALREADY GOT PAID ON MAKE.FUN**

Thirteen years of waiting for GTA VI — while my agent didn't wait at all:
it already got paid on make.fun. A Vice City sunset behind it, skyline
and palms, and the make.fun ghost standing in the scene like it owns the
place, gold coins flying around it. The picture sells make.fun in its own
voice (the agent got paid *there*), and the post text says it out loud too.

## The picture

`meme.png` — **1200 × 675 px, PNG** — rendered entirely by `main.ts`:

- Vice City sunset: purple → magenta → orange gradient sky, a low gold
  sun, a dark skyline with lit windows, palm silhouettes, a road with a
  dashed gold centre line.
- The make.fun ghost: the **official mark** from the press kit
  (`assets/mark-1024.png`, downloaded once from https://make.fun/press/
  while building this repo, never fetched at runtime), composited at
  330 × 330 px — big enough to recognise at 480 × 480.
- Caption text in a 5×7 bitmap font defined in the code as bitmasks (no
  system fonts, no image library): white with a black outline, `GTA VI`
  and `MAKE.FUN` in gold.
- Pure Node 22 standard library: a hand-written PNG decoder (for the
  ghost mark) and encoder on `node:zlib`. No network, no clock, no files
  outside the repo. Two runs write byte-identical `meme.png`.

## How to run

```bash
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/meme.png` (the meme) and copies `POST.json` to
`out/POST.json` (the gate reads the post's address from there). Run it
twice: the outputs are byte-identical.

## The post

Posted by the user, manually, from the public account **@Farhaddalsf**,
with the meme as the first (only) picture, before the deadline:

```
Waited 13 years for GTA VI. My agent didn't wait, it got paid on make.fun instead. 👻
Agents win real money in bounties on make.fun, and this meme is my entry.
@makefunai https://make.fun/bounty/gta6-meme-x-01
makefun-cottage-elevator-seal
```

- 238 characters (X-weighted ≈ 226 — the link counts as 23), well under 280.
- Carries make.fun as a link **and** `@makefunai`, and the play code
  `makefun-cottage-elevator-seal`.
- Says out loud that agents win real money in bounties on make.fun.
- No em dash anywhere.

The post's address, in `POST.json`:

```json
{"url": "https://x.com/Farhaddalsf/status/2123589296804487508"}
```

## Files

| File | What it is |
|---|---|
| `main.ts` | The program: renders `meme.png`, copies `POST.json`. Node 22 stdlib only. |
| `meme.png` | The rendered meme (1200×675). Regenerate with the command above. |
| `assets/mark-1024.png` | Official make.fun ghost mark, from the press kit (vendored). |
| `POST.json` | The real X post URL. |
| `README.md` | This file. |
| `GRADE.md` | Verification record: what was checked, what is uncertain. |
| `system-prompt.txt` | The exact task message this rebuild session was started with. |
| `LICENSE` | MIT. |
