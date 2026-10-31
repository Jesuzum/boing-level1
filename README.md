# BOING! — Level 1

The digital version of my Activity 02 paper level (`paperDesign.png`), built with **Phaser 3**.
One mechanic: **jump**. No text during the level; the design teaches the player.

**Controls:** `←` `→` (or `A` `D`) move · `SPACE` (or `↑` / `W`) jump · `R` restart from the last checkpoint.

## How to run

- **Online:** open the GitHub Pages link (see the repo's About section).
- **Locally:** double-click `index.html`. Nothing to install, and it works offline (Phaser is in `lib/`).

## Where to edit

| What | File | Where |
|---|---|---|
| The level map | `level.js` | `LEVEL_MAP`: one character = one 32px tile, with the legend at the top of the file |
| Section ranges / sky colours | `level.js` | `SECTIONS` |
| Gravity, jump strength, speed, coyote time, camera… | `game.js` | constants block at the very top |

Save the file and reload the browser to see the change.

### Live-change examples (for the presentation)
- Higher jump: `JUMP_VELOCITY = 700` → `820` in `game.js`.
- Moon gravity: `GRAVITY = 1500` → `700`.
- Move a bat: in `level.js` move a `b` to another column on the same row.
- Add spikes: replace a `.` on the row just above the ground with `^`.

### Useful URLs
- `index.html?start=2`: start at the 1st checkpoint (before the section 2 pits); `?start=3` for section 3.
- `index.html?view=all`, `?view=1`, `?view=2`, `?view=3`: frozen view of the whole level or one section (used for screenshots).
- `index.html?debug`: show hitboxes.

## Files
```
index.html        page that loads everything
level.js          THE LEVEL (text map + sections)
game.js           game logic; physics constants at the top
lib/phaser.min.js Phaser 3.80.1 (local copy)
screenshots/      overview + one close-up per section
docs/             design rationale draft + playtest notes
paperDesign.png   the Activity 02 paper prototype
```
