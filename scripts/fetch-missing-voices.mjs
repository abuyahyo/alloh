#!/usr/bin/env node
/*
 * Download the audio files (voices/*.mp3) that names.json references but that
 * are not yet present on disk.
 *
 * The data dump came from https://app.isokoon.com but a number of voice paths
 * 404 there now — try a list of likely URL prefixes for each one and use
 * whichever returns 200.
 *
 * Run from the repo root:
 *   node scripts/fetch-missing-voices.mjs
 *
 * Node 18+, no dependencies. Always exits 0 so the workflow can still run the
 * commit step on partial success.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const NAMES = new URL('json/names.json', ROOT);

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
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'audio/*,*/*;q=0.8' } });
      if (res.ok && Number(res.headers.get('content-length') || '1') > 0) {
        const buf = Buffer.from(await res.arrayBuffer());
        // Sanity check: an MP3 should not be a 0-byte or HTML response.
        if (buf.length < 200) continue;
        const head = buf.slice(0, 10).toString('utf8');
        if (head.startsWith('<') || head.startsWith('{')) continue;
        return { ok: true, buf, url };
      }
    } catch {
      // try next prefix
    }
  }
  return { ok: false };
}

const names = JSON.parse(await readFile(NAMES, 'utf8'));
const missing = [];

for (const n of names) {
  if (!n.voice) continue;
  const local = new URL(n.voice, ROOT);
  if (await exists(local)) continue;
  missing.push({ id: n.id, order: n.display_order, name: n.default_name, path: n.voice });
}

if (missing.length === 0) {
  console.log('All referenced voice files are already present.');
  process.exit(0);
}

console.log(`Missing: ${missing.length} voice file(s). Trying ${URL_PREFIXES.length} URL prefixes per file ...`);

let ok = 0, fail = 0;
const failed = [];
for (const m of missing) {
  process.stdout.write(`  [${String(m.order).padStart(3)}] ${m.name} -> ${m.path} ... `);
  const r = await tryFetch(m.path);
  if (r.ok) {
    const dest = new URL(m.path, ROOT);
    await mkdir(dirname(dest.pathname), { recursive: true });
    await writeFile(dest, r.buf);
    console.log(`ok (${(r.buf.length / 1024).toFixed(0)} KB) <- ${r.url}`);
    ok++;
  } else {
    console.log('FAIL (no working URL)');
    fail++;
    failed.push(`${m.order} ${m.name}`);
  }
}

console.log(`\nDone. ${ok} downloaded, ${fail} failed.`);
if (failed.length) {
  console.log(`\nStill missing on the upstream server:`);
  for (const f of failed) console.log(`  - ${f}`);
}
// Always exit 0 so the workflow can commit any partial success.
process.exit(0);
