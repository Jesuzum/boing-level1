# Design Rationale — BOING! Level 1 (Activity 03)

> **Draft.** Sections marked **[FILL IN]** need your own observations (Activity 02 results, the digital playtest). Read the "AI use" section and change anything you disagree with; you must be able to defend every decision.

## 1. Core mechanic
**Jump** (left/right + one action), the same as Activity 02. The player is a ball, as in the paper sketch (the circle at the start).
**[FILL IN]** Did the paper playtest show any problem with the mechanic? If not: "I kept it because the paper playtest showed…"

## 2. From paper to text map
The paper had three sheets: *Inicio*, *Desarrollo con Riesgo*, *Conclusión*. Each became a column range in `level.js` (150 × 16 tiles).

| Paper drawing | Symbol | Digital behaviour |
|---|---|---|
| ground line | `#` | solid ground with grass on top |
| rectangles / pillars | `B` | stone blocks |
| hatched boxes | `X` | wooden crates you can stand on |
| floating bars | `=` | one-way platforms (you can jump up through them) |
| `?` box | `?` | hit from below → coin pops out |
| small circles | `o` | coins |
| star | `*` | optional star (risk/reward) |
| triangles | `^` | spikes |
| bats | `b` / `v` | bats that fly left/right or up/down |
| flag | `F` | goal |
| (new) | `C` | checkpoints at the start of sections 2 and 3 |

## 3. The 4-step teaching structure
1. **Introduction (Inicio, cols 0–57). Nothing here can kill you.** A one-block step blocks the path, so the player has to press jump. The `?` block rewards jumping under things. Coins sit along the jump arcs. The stairs teach jump height. The **shallow dip** is a "pit" you can fall into with no punishment and jump out of. It previews the deadly pits safely.
2. **Development (Desarrollo con Riesgo, cols 58–97).** The same jump, but the pits are now deadly. Pillars get further apart. Coins in arcs and a vertical coin column show how high and how far to jump.
3. **Twist (start of Conclusión, cols 98–112).** Bats appear. The jump becomes an **attack**: landing on a bat defeats it and bounces you. The first bat flies over flat, safe ground with room to watch it before you reach it.
4. **Conclusion (cols 113–149). Final test:** pit, pillar, pit, spikes, then a pit with a bat flying **up and down** over it. You must time the jump (or stomp the bat), then reach the flag.

**Optional reward (risk/reward):** the star above the floating platform in section 2. To get it you jump from the crate and then must **let go of → at the right time** to land on the small platform. Too early and you fall into the pit. Tested window: releasing between ~0.4 s and ~0.7 s after the jump lands safely.

## 4. Digital tools used on purpose
| Tool | Where |
|---|---|
| **Colour & contrast** | Red = hurts (spikes, bats). Gold + glow = good (coins, star). The star has a big pulsing glow and sparkles. Deadly pits fade into a **dark void**, while the safe dip in section 1 has a visible floor. The sky colour changes per section (blue → sunset → night) so the player feels progress. |
| **Motion** | Bats move all the time, so they read as threats before you reach them. Coins spin; the star wobbles. |
| **Sound** | Jump, coin, star, stomp, damage, checkpoint and win sounds (synthesised in code, no files). |
| **Camera** | The camera leads ~170 px in the direction you face, so pits and bats appear on screen early. |
| **Forgiveness** | Coyote time 100 ms; jump buffer 120 ms; checkpoints; respawn in 0.35 s. |
| **Variable jump** | Tap = small hop, hold = full jump. Lets players adjust the star jump. |

## 5. Feel values (top of `game.js`)
`GRAVITY 1500`, `JUMP_VELOCITY 640` (≈4.3 tiles high, ≈6 tiles long at full speed), `RUN_SPEED 230`, `COYOTE_MS 100`, `JUMP_BUFFER_MS 120`, `CAMERA_LOOKAHEAD 170`. Every gap in the level is ≤ 4 tiles, so normal jumps never need pixel precision; only the star does.
**[FILL IN]** What you changed after your playtest, and why.

## 6. Changes made while translating (paper → digital)
- **Pits needed a "danger" look.** On screen, a pit was just a hole showing the sky and looked the same as the safe dip, so I added the dark void.
- **Ground after the star moved 1 tile closer.** In testing, a player who held → after the star missed the ground by ~2 pixels. That feels unfair, not risky.
- **First bat moved away from the pillar.** At first the bat patrolled right next to the pillar, so the first bat encounter was also a hard jump. Now the bat is introduced on open ground, as the twist step requires.
- **Added checkpoints.** On paper, "dying" cost nothing; in digital, replaying section 1 every time kills the pacing.
- **Added stomping.** It gives the jump a second meaning (the twist).

## 7. Two questions: physical → digital
**Q1. What changed when the level gained movement, physics and speed?**
On paper the player moves one decision at a time. In digital, distances become *timing*: a gap is now a speed × air-time problem, and bats force the player to wait or react. Things that were clear on paper (a hole) were not clear on screen until colour and motion made them readable. **[add your own observation]**

**Q2. What did you adjust along the way, and how did you decide?**
See section 6, plus your playtest changes. **[FILL IN]**

## 8. Digital playtest notes  **[FILL IN]**
Tester: ____ · Date: ____ · Total time: ____ · Deaths: ____ · Got the star? ____
Observe in silence. Note *where* they hesitate, die or look confused.

| Time / place | What they did | What it tells me | Change made |
|---|---|---|---|
| | | | |
| | | | |

**Comparison with Activity 02 (paper playtest):** what the paper tester understood vs. the digital tester; what only showed up in digital (timing, speed, the pits' readability…).

## 9. AI use
I used Claude (AI assistant) to write the code. **[REVIEW THIS LIST AND EDIT: these are decisions the AI made that you should confirm or change]**
- **My decisions:** the level layout and its 3 sections (from my paper prototype), the mechanic, the obstacle types, the star as risk/reward. **[edit]**
- **What I asked the AI for:** turn my paper map into a Phaser level with a text map, physics constants at the top, no text in the level, and the digital guidance tools.
- **Proposed by the AI, which I accepted / changed:** stomping bats, checkpoints, the dark void under pits, sky colour per section, all physics values, moving the first bat and the ground after the star (based on automated playtests).
