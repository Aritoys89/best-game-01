# EMBERFALL — Keeper of the Last Lantern

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Aritoys89/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Aritoys89/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

An original arcade game in vanilla JavaScript and canvas 2D — no external
assets at all: every sprite is drawn in code and every sound is synthesised
with WebAudio.

The valley has one light left, and the night wants it. You are the lantern
keeper, sliding along the ridge with the last lantern. Golden embers drift
down from the dark sky: catch them to score and feed the flame. The light
drains constantly, and if it reaches zero the game ends — the glow around
the lantern literally shrinks as it fades. Dark ash lumps snuff a chunk of
light and shake the screen; pale frost shards slow the fall of time.
Catching embers back-to-back builds a combo multiplier (up to ×8); letting
one hit the ground breaks it.

Play runs in "nights" of about forty seconds. Each night falls faster and
throws more ash. Survive one and the game offers a choice of two blessings —
a wider lantern, a slower drain, an ember magnet, an ash shield, a brighter
core — which stack for the rest of the run. Every night has a name, shown as
it begins. Storm wisps dart through the fall: caught, they kindle the flame
so embers feed it far more; burst beside you, they zap it. Once a night a
gale shoves the whole sky sideways, and leftover light at dawn converts to
score. Rare moonwater droplets pour +22 light back into the lantern — but
spend the streak they land on.

Every fifth night the **Ash Golem** crosses the valley: a slow silhouette
that swallows the embers falling into it, drains extra light from a keeper
standing in its shadow, and stomps every few seconds, shaking bonus embers
loose. Survive its night and the dawn pays +150 and guarantees a rare
blessing among the two offered.

Runs also earn **Keeper's Marks** (1 per 150 points, plus 1 per night
survived), kept in localStorage and spent at the title screen in the
**Keeper's Cache** (press C): Deep Wick (more starting light), Wide Hands
(a wider basket) and the Ward Charm (a shield that renews) — three levels
each, prices climbing, permanent on every run.

**Controls:** mouse, or ← → / A D to move · Enter or click to start ·
1 / 2 (or click) to choose a blessing · C opens the Cache at the title ·
P pauses · M mutes (a sound indicator sits in the corner). The best score
is kept in localStorage.

## Run it

Build the handover package (copies `game/` and `screenshots/` to the output
directory and writes the `dossier.json` summary):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

To play, serve the `game/` folder with any static file server and open it
in a desktop browser, e.g.:

```sh
cd game && python3 -m http.server 8080
# then visit http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=k7c6ejze&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
