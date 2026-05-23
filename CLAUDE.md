# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contents

- [Project](#project)
- [Local development](#local-development)
- [Architecture](#architecture)
- [Mirror rule (with one documented exception)](#mirror-rule-with-one-documented-exception)
- [Cache busting](#cache-busting)
- [Sanitizer constraint (do not regress)](#sanitizer-constraint-do-not-regress)
- [Body-text size control](#body-text-size-control)
- [About-the-names section](#about-the-names-section)
- [Translation data](#translation-data)
- [Fonts and styling](#fonts-and-styling)
- [Git workflow](#git-workflow)
- [Don'ts](#donts)

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
  index.html, name.html, about.html
  app.js, name.js, about.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json, cards.json, about.json}
  cards/, icons/, images/, voices/, manifest.webmanifest

/uz/         Uzbek edition (lang="uz", dir="ltr") — a near-mirror
  index.html, name.html, about.html
  app.js, name.js, about.js, shared.js, sw.js, style.css
  json/{names.json, name_translations.json, about.json}
  icons/, images/, voices/, manifest.webmanifest
```

### Page wiring

- `index.html` → `app.js` renders the grid of name cards, search,
  favorites toggle, and per-card audio playback.
- `name.html?id=<gods_name_id>` → `name.js` renders the detail view:
  hero, short meaning, scholars' meanings, evidence, prev/next nav,
  the A−/A/A+ size control, and (Arabic edition only) the visual
  library.
- `about.html` → `about.js` is one page that handles two views:
  no query → grid of educational articles (16:9 image cards with
  the title centered as an overlay); `?id=N` → article detail (no
  hero image, sanitised title + body + A−/A/A+ size control). A
  small "about" icon to the left of `.search-shell` on every index
  page links here.
- `shared.js` exports:
  - DOM helpers (`$`, `$$`) and `loadJSON`.
  - The UI string table for this edition's language plus `tFor`.
  - Path validators (`safePath`, `safeSvgPath`, `safeVoicePath`,
    `safeColor`) — anything not matching the regex is dropped before
    use, so untrusted JSON cannot inject arbitrary URLs.
  - Inline SVG icons and the `showToast` helper.
  - `createAudioController` — owns the single page-level `<audio>`
    element and tracks `playingId` / `loadingId` so the play/pause/
    spinner UI stays in sync.
- `sw.js` is **network-first for HTML navigations** (so deploys land
  immediately) and **cache-first for everything else** (which is safe
  because non-HTML assets are versioned via `?v=` query strings).

### Data flow (both editions)

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
If you change `style.css`, `name.js`, `app.js`, `about.js`, `shared.js`,
`sw.js`, `index.html`, `name.html`, or `about.html` at the root, mirror
the change to `/uz/` in the same commit.

**Exception — the Uzbek edition has no visual library.** It is
intentional, not an oversight:

- `/uz/json/` does **not** contain `cards.json`.
- `/uz/name.html` has no `#library` section markup.
- `/uz/name.js`:
  - does not load `cards.json`.
  - has no `renderLibrary`, `pickByLang`, `safeCardPath`, or
    `suggestedDownloadName`.
  - does not import `iconDownload`.
- `/uz/shared.js` does not export `iconDownload`.

When mirroring a change that touches the library code path, leave the
Uzbek side without the library. Do not re-add `cards.json` to `/uz/`
or re-introduce the library section there.

**Exception — the Arabic edition omits the Latin transliteration.**
Arabic readers see the calligraphy itself as the name, so the Latin
`t.name` field (`"Allāh"`, `"Ar-Rahmān"`, …) doesn't render in the
ar UI at all:

- `app.js` (ar) skips the `.card-pill` on grid cards and the
  `.featured-card-translit` on the today's-name spotlight.
- `name.js` (ar) omits the `.card-translit` `<span>` in the hero
  toolbar (play + favourite buttons stay), drops the `' — translit'`
  suffix from `document.title`, and the share card composer doesn't
  paint a translit line — `summary` slides up to where the translit
  used to sit.
- ARIA labels built from `n.default_name` no longer append the
  Latin form.

When mirroring a change to `/uz/`, keep the translit on the uz side
— Cyrillic transliterations are the primary label there. Don't
add `.card-pill` back to ar grid cards or paint the translit on the
ar share card.

Data files (`json/*.json`) are otherwise per-language — do NOT mirror
translation content between the two trees.

## Cache busting

A single version string lives in **fourteen places** and must move
together on every deploy. Use `YYYYMMDDHH` or `YYYYMMDDHHMM` style —
pick one string and apply it everywhere in one commit.

Service worker cache constants (2):

1. `sw.js` → `const CACHE = 'alloh-v<version>';`
2. `uz/sw.js` → same constant

HTML `?v=` query strings (12, three HTML files × two refs each × two
editions):

3. `index.html` → `style.css?v=<version>`
4. `index.html` → `app.js?v=<version>`
5. `name.html` → `style.css?v=<version>`
6. `name.html` → `name.js?v=<version>`
7. `about.html` → `style.css?v=<version>`
8. `about.html` → `about.js?v=<version>`
9. `uz/index.html` → `style.css?v=<version>`
10. `uz/index.html` → `app.js?v=<version>`
11. `uz/name.html` → `style.css?v=<version>`
12. `uz/name.html` → `name.js?v=<version>`
13. `uz/about.html` → `style.css?v=<version>`
14. `uz/about.html` → `about.js?v=<version>`

The current deployed version can be found by grepping `?v=` across the
HTMLs (they should all match). HTML responses are network-first, so the
new HTML lands on the next visit and immediately requests the new
`?v=`-tagged assets, evicting the previous cache on activate.

A partial bump (e.g. `sw.js` without the HTMLs, or one edition without
the other) leaves users with mismatched assets — don't ship one without
the other.

To bump all fourteen in one shot, replace `<OLD>` and `<NEW>` and run:

```sh
sed -i 's/<OLD>/<NEW>/g' \
  sw.js uz/sw.js \
  index.html name.html about.html \
  uz/index.html uz/name.html uz/about.html
```

Then verify with
`grep -RnE 'alloh-v[0-9]+|\?v=[0-9]+' sw.js uz/sw.js *.html uz/*.html`
— every match should show `<NEW>` and there should be exactly fourteen.

## Sanitizer constraint (do not regress)

`name.js` and `about.js` render sanitized HTML fragments from the
translation / about JSON. Both files carry an identical copy of the
same sanitizer — four copies in total once mirrored to `/uz/`. The
sanitizer enforces two whitelists:

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

All four sanitizer copies (`name.js` and `about.js` in each edition)
must be kept in lock-step. Changes to either whitelist must land in
the same commit across the four files.

## Body-text size control

`name.html` and `about.html` ship a three-button toolbar at the
bottom (`A−` / `A` / `A+`) that scales the body prose.

- The selected level is stored in `localStorage['textSize']` as one
  of `'sm' | 'md' | 'lg'` and persists across name / article hops.
- `applyTextSize()` toggles `data-text-size` on the `<html>` element
  on init *before* content renders (so there's no flash at the
  default size). CSS reacts via
  `:root[data-text-size="sm"] { --text-scale: 0.9 }` /
  `:root[data-text-size="lg"] { --text-scale: 1.18 }`.
- `.section-body` font-size uses `calc(1rem * var(--text-scale))`
  for LTR and `calc(1.2rem * var(--text-scale))` for RTL, so both
  scripts scale by the same factor; `.ar-quote` and lists inherit
  via em.
- The click handler records the clicked button's
  `getBoundingClientRect().top` before applying the new size and
  then `scrollBy({ behavior: 'instant' })` by the delta so the
  tapped button stays under the user's finger — without this the
  page appears to jump as the document height changes.

The control lives in both `name.js` and `about.js`, mirrored across
editions; treat it like the sanitizer when you change anything.

## About-the-names section

The two `about.html` pages serve educational articles alongside the
99-name catalog.

- Data lives in `json/about.json` per edition. Each record has
  `id`, `display_order`, `image` (path in `images/`), `color`
  (pre-image card tint, fed through `safeColor`), `title_val`, and
  `body_val` (sanitized HTML, same whitelist as `name.js`).
- One HTML serves both list and detail views: `about.html` with no
  query renders a 16:9 grid of cards (title centered as an
  overlay); `about.html?id=N` renders a detail view with only title
  + body + A−/A/A+ size control — **no hero image** on the detail
  page.
- The card factory drops records with an empty `title_val`, so a
  half-translated article in `uz/json/about.json` is invisible on
  the uz list until its title lands. Use this to stage translation
  work without breaking the page.
- `images/about-NN.jpg` files are 16:9, JPEG q=82, optimized via
  Pillow. They are **not** versioned via `?v=` — when swapping an
  image at the same filename, bump the cache version (the SW will
  drop its copy on activate, though the browser's HTTP cache may
  still serve the old image for one visit on hard-refresh).

## Translation data

- `json/name_translations.json` — 100 records per edition, keyed by
  `gods_name_id`. Each record has `short_meaning_val`, `meanings_val`
  (scholars' explanations), `evidence_val`, `name` (transliteration),
  and matching `*_key` fields.
- `evidence_val` is bilingual in the `uz` edition only — Arabic verses
  wrapped in `<span dir="rtl" class="ar-quote">` next to their Uzbek
  translation. In the `ar` edition the same field is pure Arabic.
- Audio file path lives on the `names.json` record as `voice`
  (validated by `safeVoicePath`), not on the translation record.
- Uzbek transliterations of names follow Tashkent reading conventions
  already established in `/uz/json/name_translations.json` —
  e.g. Мусоввир (#14), Хофиз (#23), Муқоддим (#59).
- When editing translations, never add evidence that isn't already
  in the source file — the user's standing rule is
  "далилни фақат файлдан ол".

## Fonts and styling

- UI chrome: Cairo 600
- Arabic body: Amiri
- Quranic calligraphy lines: Amiri Quran
- Theme is dark-only; `<html data-theme="dark">` is set inline in the
  `<head>` of every HTML page (before stylesheet load) to prevent a
  flash of light theme.
- The header bar reserves iOS notch space via
  `padding-top: max(0.75rem, env(safe-area-inset-top))`.

## Git workflow

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
- Don't forget the about-page entries when bumping the cache —
  the surface is fourteen places, not ten.
- Don't put a hero image back on the About-article detail view
  (the list view keeps its 16:9 image cards; the detail is
  intentionally text-only).
- Don't push to `main` directly.
