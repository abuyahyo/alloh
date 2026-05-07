#!/usr/bin/env node
/*
 * Download the card images (cards/*.jpg, occasionally images/*.jpg) that
 * json/cards.json references but that aren't yet present on disk.
 *
 * Mirrors the shape of fetch-missing-voices.mjs: tries a list of likely URL
 * prefixes for each path and uses whichever one returns a real image.
 *
 * Run from the repo root:
 *   node scripts/fetch-missing-cards.mjs
 *
 * Node 18+, no dependencies. Always exits 0 so the workflow can still run
 * the commit step on partial success.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const CARDS = new URL('json/cards.json', ROOT);

const URL_PREFIXES = [
  'https://app.isokoon.com/',
  'https://app.isokoon.com/storage/',
  'https://app.isokoon.com/storage/app/public/',
  'https://app.isokoon.com/public/',
  'https://app.isokoon.com/uploads/',
  'https://isokoon.com/',
  'https://isokoon.com/storage/',
  'https://www.isokoon.com/',
];

const UA = 'Mozilla/5.0 (compatible; HeIsAllahBot/1.0; +https://github.com/abuyahyo/alloh)';

const exists = async (p) => access(p).then(() => true).catch(() => false);

async function tryFetch(path) {
  for (const prefix of URL_PREFIXES) {
    const url = prefix + path;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Sanity check: an image shouldn't be a 0-byte HTML/JSON response.
      if (buf.length < 200) continue;
      const head = buf.slice(0, 10).toString('utf8');
      if (head.startsWith('<') || head.startsWith('{')) continue;
      return { ok: true, buf, url };
    } catch {
      // try next prefix
    }
  }
  return { ok: false };
}

const cards = JSON.parse(await readFile(CARDS, 'utf8'));
const seen = new Set();
const missing = [];

for (const c of cards) {
  if (!c.image || seen.has(c.image)) continue;
  seen.add(c.image);
  const local = new URL(c.image, ROOT);
  if (await exists(local)) continue;
  missing.push(c.image);
}

if (missing.length === 0) {
  console.log('All referenced card images are already present.');
  process.exit(0);
}

console.log(`Missing: ${missing.length} card image(s). Trying ${URL_PREFIXES.length} URL prefixes per file ...`);

let ok = 0, fail = 0;
const failed = [];
for (const path of missing) {
  process.stdout.write(`  ${path} ... `);
  const r = await tryFetch(path);
  if (r.ok) {
    const dest = new URL(path, ROOT);
    await mkdir(dirname(dest.pathname), { recursive: true });
    await writeFile(dest, r.buf);
    console.log(`ok (${(r.buf.length / 1024).toFixed(0)} KB) <- ${r.url}`);
    ok++;
  } else {
    console.log('FAIL (no working URL)');
    fail++;
    failed.push(path);
  }
}

console.log(`\nDone. ${ok} downloaded, ${fail} failed.`);
if (failed.length) {
  console.log(`\nStill missing on the upstream server:`);
  for (const p of failed) console.log(`  - ${p}`);
}
process.exit(0);
