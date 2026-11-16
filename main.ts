// EMBERFALL — handover program for the make.fun best-game-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// browser and it plays, offline, with no build step). This program prepares
// the entry: it copies game/ and screenshots/ into the output directory and
// asks the vendored make.fun library to summarise that tree into
// dossier.json, the file the judges read first.
//
// Run it with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR defaults to /output, where the grader looks.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh copies of the two payloads, so a stale file from an earlier run can
// never sneak into the handover.
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps mirror the competition gate: they make this program refuse a
// tree the scorer would refuse anyway (too many or too heavy screenshots,
// an oversized game folder, path names too long to catalogue).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`EMBERFALL handed over to ${outDir} (dossier.json: ${dossier.length} bytes)`);
