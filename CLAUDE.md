# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Progressive Web App for the 99 Beautiful Names of Allah (Asmaa-ul-Husna).
Vanilla JS ES modules, no build step. Deployed to GitHub Pages.

- Repo: `abuyahyo/alloh`
- Default branch: `main`
- Working branch: whatever the current session was assigned. Create it
  locally if missing; do not push to `main`.
- Live URLs:
  - Arabic: <https://abuyahyo.github.io/alloh/>
  - Uzbek:  <https://abuyahyo.github.io/alloh/uz/>

## Local development

There is no build, bundler, lint, or test command. To preview the site
exactly as deployed, serve the repo root over HTTP (service workers and
ES modules won't load from `file://`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000/  (ar)  or  http://localhost:8000/uz/
```

If the service worker has cached an old build during testing, clear it
from DevTools → Application → Service Workers (or bump the cache-bust
version as described below).

## Architecture

The site ships as **two independent single-language copies** that share
styles and structure but no runtime language switcher. They are deployed
together to the same GitHub Pages site.

```
/            Arabic edition (lang="ar", dir="rtl")
  index.html, name.html, app.js, name.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json, cards.json}
  cards/, icons/, images/, voices/, manifest.webmanifest

/uz/         Uzbek edition (lang="uz", dir="ltr") — a near-mirror
  index.html, name.html, app.js, name.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json}
  icons/, images/, voices/, manifest.webmanifest
```

Page wiring:

- `index.html` → `app.js` renders the grid of name cards, search,
  favorites toggle, and per-card audio playback.
- `name.html?id=<gods_name_id>` → `name.js` renders the detail view:
  hero, short meaning, scholars' meanings, evidence, prev/next nav,
  and (Arabic edition only) the visual library.
- `shared.js` exports DOM helpers, the UI string table for this
  edition's language, sanitized path validators (`safePath`,
  `safeSvgPath`, `safeVoicePath`, `safeColor`), inline SVG icons, the
  toast helper, and `createAudioController` — the single audio element
  is owned at the page level and the controller tracks `playingId` /
  `loadingId` for UI sync.
- `sw.js` is **network-first for HTML navigations** (so deploys land
  immediately) and **cache-first for everything else** (which is safe
  because non-HTML assets are versioned via `?v=` query strings).

Data flow (both editions):

1. `app.js` / `name.js` `Promise.all`-loads `json/names.json` and
   `json/name_translations.json` (and `cards.json` for ar only).
2. `names.json` is sorted by `display_order`.
3. `name_translations.json` is indexed into `state.translations` as a
   `Map<gods_name_id, { [lang]: record }>`; `localized()` in `shared.js`
   reads the single language present in this edition.
4. The detail page renders the rich-HTML fields (`short_meaning_val`,
   `meanings_val`, `evidence_val`) through the sanitizer in `name.js`
   before inserting them into the DOM.

## Mirror rule (with one documented exception)

Any CSS, JS, service worker, or HTML-template change made at the root
must be re-applied under `/uz/` (and vice-versa) unless it is data-only.
If you change `style.css`, `name.js`, `app.js`, `shared.js`, `sw.js`,
`index.html`, or `name.html` at the root, mirror the change to `/uz/`
in the same commit.

**Exception — the Uzbek edition has no visual library.** It is
intentional, not an oversight:

- `/uz/json/` does **not** contain `cards.json`.
- `/uz/name.html` has no `#library` section markup.
- `/uz/name.js` does not load `cards.json`, has no `renderLibrary`,
  `pickByLang`, `safeCardPath`, or `suggestedDownloadName`, and does
  not import `iconDownload`.
- `/uz/shared.js` does not export `iconDownload`.

When mirroring a change that touches the library code path, leave the
Uzbek side without the library. Do not re-add `cards.json` to `/uz/`
or re-introduce the library section there.

Data files (`json/*.json`) are otherwise per-language — do NOT mirror
translation content between the two trees.

## Cache busting

A single version string lives in **ten places** and must move together
on every deploy. Use `YYYYMMDDHH` or `YYYYMMDDHHMM` style — pick one
string and apply it everywhere in one commit.

1. `sw.js` → `const CACHE = 'alloh-v<version>';`
2. `uz/sw.js` → same constant
3. `index.html` → `style.css?v=<version>` and `app.js?v=<version>`
4. `name.html` → `style.css?v=<version>` and `name.js?v=<version>`
5. `uz/index.html` → both `?v=...` entries
6. `uz/name.html` → both `?v=...` entries

The current deployed version can be found by grepping `?v=` across the
HTMLs (they should all match). HTML responses are network-first, so the
new HTML lands on the next visit and immediately requests the new
`?v=`-tagged assets, evicting the previous cache on activate.

A partial bump (e.g. `sw.js` without the HTMLs, or one edition without
the other) leaves users with mismatched assets — don't ship one without
the other.

## Sanitizer constraint (do not regress)

`name.js` renders sanitized HTML fragments from the translation JSON.
The sanitizer enforces two whitelists:

```js
const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const ALLOWED_ATTRS_BY_TAG = {
  SPAN: new Set(['class', 'dir']),
};
```

Arabic verses inside Uzbek prose carry
`<span dir="rtl" class="ar-quote">…</span>`. Stripping `dir` from
spans makes Quranic ornate parentheses ﴿ ﴾ render on the wrong sides.
Keep `class` and `dir` in this whitelist. Do not broaden the tag set
or add new attributes without a concrete content need — every addition
expands the XSS surface for fields that originate in third-party data.

Both editions' `name.js` carry an identical copy of the sanitizer —
changes to either whitelist must be mirrored.

## Translation data

- `json/name_translations.json` — 100 records per edition, keyed by
  `gods_name_id`, each with: `short_meaning_val`, `meanings_val`
  (scholars' explanations), `evidence_val`, `name` (transliteration),
  and matching `*_key` fields. In the `uz` edition `evidence_val`
  carries Arabic verses wrapped in `<span dir="rtl" class="ar-quote">`
  alongside their Uzbek translation; in the `ar` edition the same
  field is pure Arabic.
- Audio file path is `voice` on the `names.json` record (validated by
  `safeVoicePath`), not on the translation record.
- Uzbek transliterations of names follow Tashkent reading conventions
  already established in `/uz/json/name_translations.json` —
  e.g. Мусоввир (#14), Хофиз (#23), Муқоддим (#59).
- When editing translations, never add evidence that isn't already
  in the source file — the user's standing rule is
  "далилни фақат файлдан ол".

## Asset backfill (GitHub Actions)

Three workflows in `.github/workflows/` keep media in sync with the
upstream `app.isokoon.com` API. They run on `main`, on push to the
relevant data file, and on a daily cron:

- `fetch-voices.yml` → runs `scripts/fetch-missing-voices.mjs`,
  triggered by changes to `json/names.json`.
- `fetch-images.yml` → runs `scripts/fetch-missing-images.mjs`,
  triggered by changes to `json/names.json`.
- `fetch-cards.yml` → runs `scripts/fetch-missing-cards.mjs`,
  triggered by changes to `json/cards.json`.

These scripts live in `scripts/` on `main` (they may not be present on
every feature branch). Each job commits any newly downloaded files
back to `main` via `github-actions[bot]`. If a workflow goes red,
inspect the script on `main` rather than re-fetching media by hand.

## Fonts and styling

- UI chrome: Cairo 600
- Arabic body: Amiri
- Quranic calligraphy lines: Amiri Quran
- Theme is dark-only; `<html data-theme="dark">` is set inline in the
  `<head>` of every HTML page (before stylesheet load) to prevent a
  flash of light theme.
- The header bar reserves iOS notch space via
  `padding-top: max(0.75rem, env(safe-area-inset-top))`.

## Workflow

1. Develop on the branch named in the session instructions. Create it
   locally if missing.
2. Commit with descriptive multi-line messages ending with the
   `https://claude.ai/code/session_…` trailer.
3. Push with `git push -u origin <branch>`. Retry on transient network
   errors with exponential backoff (2s, 4s, 8s, 16s).
4. Do NOT open a PR unless the user asks. When asked, open via the
   GitHub MCP tools (`mcp__github__*`), not `gh`.
5. GitHub MCP tools are scoped to `abuyahyo/alloh` only.

## Don'ts

- Don't reintroduce Russian or a runtime language switcher — the app is
  two standalone single-language copies by design.
- Don't add a build step, framework, or bundler.
- Don't widen the sanitizer (tag set or per-tag attributes) beyond what's
  necessary, and mirror any change to both editions.
- Don't bump `sw.js` without bumping the HTML `?v=` queries in the same
  commit (and vice-versa) — partial bumps cause stale-asset mismatches.
- Don't re-introduce the visual library or `cards.json` to `/uz/`.
- Don't push to `main` directly.
