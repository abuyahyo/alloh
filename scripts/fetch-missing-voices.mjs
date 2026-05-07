#!/usr/bin/env node
/*
 * Download the audio files (voices/*.mp3) that names.json references but that
 * are not yet present on disk. Source: https://app.isokoon.com/<voice-path>.
 *
 * Run from the repo root:
 *   node scripts/fetch-missing-voices.mjs
 *
 * No external dependencies (uses Node 18+ built-in fetch).
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const NAMES = new URL('json/names.json', ROOT);
const SOURCE = 'https://app.isokoon.com';

const exists = async (p) => access(p).then(() => true).catch(() => false);

const names = JSON.parse(await readFile(NAMES, 'utf8'));
const missing = [];

for (const n of names) {
  if (!n.voice) continue;
  const local = new URL(n.voice, ROOT);
  if (await exists(local)) continue;
  missing.push({ id: n.id, order: n.display_order, name: n.default_name, path: n.voice, url: `${SOURCE}/${n.voice}` });
}

if (missing.length === 0) {
  console.log('All referenced voice files are already present. Nothing to fetch.');
  process.exit(0);
}

console.log(`Missing: ${missing.length} voice file(s). Fetching from ${SOURCE} ...`);

let ok = 0, fail = 0;
for (const m of missing) {
  process.stdout.write(`  [${String(m.order).padStart(3)}] ${m.name} -> ${m.path} ... `);
  try {
    const res = await fetch(m.url);
    if (!res.ok) { console.log(`FAIL (${res.status})`); fail++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = new URL(m.path, ROOT);
    await mkdir(dirname(dest.pathname), { recursive: true });
    await writeFile(dest, buf);
    console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) {
    console.log(`FAIL (${e.message})`);
    fail++;
  }
}

console.log(`\nDone. ${ok} downloaded, ${fail} failed.`);
if (ok > 0) {
  console.log(`\nNext:`);
  console.log(`  git add voices/`);
  console.log(`  git commit -m "Add missing voice recordings"`);
  console.log(`  git push`);
}
process.exit(fail > 0 && ok === 0 ? 1 : 0);
