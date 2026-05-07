#!/usr/bin/env node
/*
 * Download the per-name SVG calligraphy (and any other images/* asset
 * referenced from names.json) that aren't yet on disk.
 *
 * Five entries in the dump came without their SVG file on disk; this
 * script attempts to backfill them from the upstream server.
 *
 * Mirrors fetch-missing-voices.mjs and fetch-missing-cards.mjs: tries a
 * list of likely URL prefixes for each path and uses whichever one
 * returns real image bytes. Always exits 0 so the workflow can still run
 * the commit step on partial success.
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
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) continue;
      // SVG starts with `<?xml` or `<svg`; raster images don't start with `{` either.
      const head = buf.slice(0, 16).toString('utf8').trim();
      if (head.startsWith('{') || head.toLowerCase().startsWith('<!doctype html')) continue;
      return { ok: true, buf, url };
    } catch {
      // try next prefix
    }
  }
  return { ok: false };
}

const names = JSON.parse(await readFile(NAMES, 'utf8'));
const seen = new Set();
const missing = [];

for (const n of names) {
  for (const key of ['image', 'background_image']) {
    const p = n[key];
    if (!p || seen.has(p)) continue;
    seen.add(p);
    const local = new URL(p, ROOT);
    if (await exists(local)) continue;
    missing.push({ name: n.default_name, order: n.display_order, path: p });
  }
}

if (missing.length === 0) {
  console.log('All referenced image assets are already present.');
  process.exit(0);
}

console.log(`Missing: ${missing.length} image asset(s). Trying ${URL_PREFIXES.length} URL prefixes per file ...`);

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
    failed.push(`${m.order} ${m.name} (${m.path})`);
  }
}

console.log(`\nDone. ${ok} downloaded, ${fail} failed.`);
if (failed.length) {
  console.log(`\nStill missing on the upstream server:`);
  for (const f of failed) console.log(`  - ${f}`);
}
process.exit(0);
