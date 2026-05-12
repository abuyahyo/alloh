# CLAUDE.md — He Is Allah PWA

Guide for Claude when working on this repository.

## Project

A Progressive Web App for the 99 Beautiful Names of Allah (Asmaa-ul-Husna).
Vanilla JS ES modules, no build step. Deployed to GitHub Pages.

- Repo: `abuyahyo/alloh`
- Default branch: `main`
- Working branch: `claude/file-viewing-j3rYQ`
- Live URLs:
  - Arabic: <https://abuyahyo.github.io/alloh/>
  - Uzbek:  <https://abuyahyo.github.io/alloh/uz/>

## Layout

The site ships as two independent single-language copies that share styles
and structure but no runtime language switcher.

```
/            Arabic edition (lang="ar", dir="rtl")
  index.html, name.html, app.js, name.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json, cards.json}
  cards/, icons/, images/, voices/, manifest.webmanifest

/uz/         Uzbek edition (lang="uz", dir="ltr") — a full mirror
  index.html, name.html, app.js, name.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json, cards.json}
  cards/, icons/, images/, voices/, manifest.webmanifest
```

`name_translations.json` at each root contains only that language's records
(100 entries each). The two trees are deployed together to GitHub Pages.

## Mirror rule

Any CSS, JS, service worker, or HTML-template change made at the root
must be re-applied under `/uz/` (and vice-versa) unless it is data-only.
If you change `style.css`, `name.js`, `app.js`, `shared.js`, `sw.js`,
`index.html`, or `name.html` at the root, mirror the change to `/uz/`
in the same commit.

Data files (`json/*.json`) are intentionally per-language — do NOT mirror.

## Cache busting

Three places must move together on every deploy:

1. `sw.js` — bump the `CACHE` constant: `const CACHE = 'alloh-vYYYYMMDDHHM';`
2. `index.html`, `name.html` — bump the `?v=...` query on every `<script>`
   and `<link rel="stylesheet">` (both root and `/uz/`).
3. The service worker is network-first for HTML navigations, so HTML
   updates land immediately. Assets are cache-first and rely on `?v=`.

Pick a single version string (e.g. `2026051132`) and use it in all six
spots in one commit.

## Sanitizer constraint (do not regress)

`name.js` renders sanitized HTML fragments from the translation JSON.
The sanitizer keeps a whitelist of attributes per tag:

```js
const ALLOWED_ATTRS_BY_TAG = {
  SPAN: new Set(['class', 'dir']),
};
```

Arabic verses inside Uzbek prose carry `<span dir="rtl" class="ar-quote">…</span>`.
Stripping `dir` from spans makes Quranic ornate parentheses ﴿ ﴾ render on
the wrong sides. Keep `class` and `dir` in this whitelist.

## Translation data

- `json/name_translations.json` — 100 records, each with:
  `meanings_val` (uniform paragraph of scholars' explanations),
  `evidence_val` (bilingual Arabic verse + translation),
  `short_meaning`, `recitation_audio`, etc.
- Uzbek transliterations of names follow Tashkent reading conventions
  already established in `/uz/json/name_translations.json` —
  e.g. Мусоввир (#14), Хофиз (#23), Муқоддим (#59).
- When editing translations, never add evidence that isn't already
  in the source file — the user's standing rule is "далилни фақат файлдан ол".

## Fonts and styling

- UI chrome: Cairo 600
- Arabic body: Amiri
- Quranic calligraphy lines: Amiri Quran
- Theme is dark-only; `<html data-theme="dark">` is set inline in `<head>`.
- The header bar reserves iOS notch space via
  `padding-top: max(0.75rem, env(safe-area-inset-top))`.

## Workflow

1. Work on `claude/file-viewing-j3rYQ`. Create it locally if missing.
2. Commit with descriptive multi-line messages ending with the
   `https://claude.ai/code/session_…` trailer.
3. Push with `git push -u origin claude/file-viewing-j3rYQ`.
   Retry on transient network errors with exponential backoff.
4. Do NOT open a PR unless the user asks. When asked, open via the
   GitHub MCP tools (`mcp__github__*`), not `gh`.
5. GitHub MCP tools are scoped to `abuyahyo/alloh` only.

## Don'ts

- Don't reintroduce Russian or a runtime language switcher — the app is
  two standalone single-language copies by design.
- Don't add a build step, framework, or bundler.
- Don't widen the sanitizer beyond what's necessary.
- Don't bump `sw.js` without bumping the HTML `?v=` queries in the same
  commit (and vice-versa) — partial bumps cause stale-asset mismatches.
- Don't push to `main` directly.
