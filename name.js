import {
  DEFAULT_LANG,
  UI_STRINGS,
  $, $$,
  loadJSON, applyDir, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconLoading, iconHeart, iconDownload,
  createAudioController, attachImgFade,
  tFor,
} from './shared.js';

const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const SECTIONS = [
  { act: 'meanings', valKey: 'meanings_val', keyKey: 'meanings_key' },
  { act: 'evidence', valKey: 'evidence_val', keyKey: 'evidence_key' },
];

function ui(key) {
  return tFor(state.lang, key);
}

const state = {
  names: [],
  translations: new Map(),
  languages: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  currentId: null,
  cards: new Map(),   // gods_name_id -> [{ image, lang }, …]
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
  getLang: () => state.lang,
  onChange: refreshPlayingUI,
});


async function init() {
  const params = new URLSearchParams(location.search);
  const idParam = params.get('id');
  const id = idParam ? Number(idParam) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    location.replace('index.html');
    return;
  }
  state.currentId = id;

  bindEvents();

  let names, trans, langs, cards;
  try {
    [names, trans, langs, cards] = await Promise.all([
      loadJSON('json/names.json'),
      loadJSON('json/name_translations.json'),
      loadJSON('json/languages.json'),
      loadJSON('json/cards.json').catch((e) => { console.warn('cards.json:', e); return []; }),
    ]);
  } catch (err) {
    console.error(err);
    $('#hero').removeAttribute('aria-busy');
    $('#hero').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
    return;
  }

  state.names = names.sort((a, b) => a.display_order - b.display_order);

  // Show a language in the dropdown if it has either name-content
  // translations or just UI strings (content then falls back to Arabic).
  const transLangs = new Set(trans.map((t) => t.lang));
  state.languages = langs.filter((l) => transLangs.has(l.code) || l.code in UI_STRINGS);

  for (const t of trans) {
    if (!state.translations.has(t.gods_name_id)) state.translations.set(t.gods_name_id, {});
    state.translations.get(t.gods_name_id)[t.lang] = t;
  }

  for (const c of cards) {
    if (!state.cards.has(c.gods_name_id)) state.cards.set(c.gods_name_id, []);
    state.cards.get(c.gods_name_id).push(c);
  }

  if (!state.languages.find((l) => l.code === state.lang)) state.lang = DEFAULT_LANG;

  applyLangChrome();
  render();
}

function applyLangChrome() {
  applyDir(state.lang);
  const home = $('#bar-home');
  if (home) home.setAttribute('aria-label', ui('home'));
}

function loc(name) {
  return localized(state.translations, name, state.lang);
}

function render() {
  const name = state.names.find((n) => n.id === state.currentId);
  const hero = $('#hero');
  if (!name) {
    hero.removeAttribute('aria-busy');
    hero.innerHTML = `<p class="empty">${escapeHtml(ui('not_found'))}</p>`;
    return;
  }

  const t = loc(name);
  const translit = t.name || '';
  const bg = safePath(name.background_image);
  const isFav = state.favorites.has(name.id);
  const tint = safeColor(name.color);

  document.title = `${name.default_name}${translit ? ' — ' + translit : ''} | ${ui('pwa_title')}`;
  if (tint) hero.style.backgroundColor = tint;

  const calligraphy = safeSvgPath(name.image);
  const calligraphyHtml = calligraphy
    ? `<img class="card-arabic-svg" src="${escapeHtml(calligraphy)}" alt="${escapeHtml(name.default_name)}" loading="eager" decoding="async" data-fallback="${escapeHtml(name.default_name)}">`
    : escapeHtml(name.default_name);

  const playing = audioCtrl.isPlaying(name.id);
  const loading = audioCtrl.isLoading(name.id);
  const playLabel = ui(loading ? 'loading' : (playing ? 'pause' : 'play'));
  const favLabel = ui(isFav ? 'unfavorite' : 'favorite');
  const playIcon = loading ? iconLoading() : (playing ? iconPause() : iconPlay());

  hero.removeAttribute('aria-busy');
  hero.innerHTML = `
    ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high">` : ''}
    <span class="card-arabic">${calligraphyHtml}</span>
    <div class="card-foot">
      <button class="card-icon-btn card-play${playing ? ' is-playing' : ''}${loading ? ' is-loading' : ''}" data-action="play" aria-label="${escapeHtml(playLabel)}" type="button">
        ${playIcon}
      </button>
      <span class="card-translit">${escapeHtml(translit)}</span>
      <button class="card-icon-btn card-fav${isFav ? ' is-fav' : ''}" data-action="fav" aria-label="${escapeHtml(favLabel)}" aria-pressed="${isFav ? 'true' : 'false'}" type="button">
        ${iconHeart()}
      </button>
    </div>
  `;
  attachImgFade(hero.querySelector('img.card-bg.is-loading'));
  const calligraphyImg = hero.querySelector('img.card-arabic-svg');
  if (calligraphyImg) {
    calligraphyImg.addEventListener('error', () => {
      calligraphyImg.replaceWith(document.createTextNode(calligraphyImg.dataset.fallback || ''));
    }, { once: true });
  }

  setSanitizedHTML($('#meaning'), t.short_meaning_val);
  renderUiStrings();
  renderSections(name);
  renderLibrary(name);
  renderPageNav(name);
}

function renderUiStrings() {
  $$('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const text = ui(key);
    if (!text) return;
    // If the element wraps a single <span> (used by section/library titles
    // for the pill background), update the span so the styling survives.
    const span = el.querySelector(':scope > span');
    if (span && el.children.length === 1) {
      span.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

/**
 * Build the visible sections. Sections with no content (after Arabic
 * fallback) are skipped entirely so the page only shows what's there.
 */
function renderSections(name) {
  const t = loc(name);
  const tr = state.translations.get(name.id) || {};
  const tAr = tr.ar || {};
  // If the user picked a language we don't have any name content for
  // (e.g. uz before its translations land), every section is implicitly
  // an Arabic fallback — surface the ar_only notice on every one of them.
  const langWideFallback = !tr[state.lang] && state.lang !== DEFAULT_LANG;
  const sectionsEl = $('#sections');
  sectionsEl.replaceChildren();

  for (const s of SECTIONS) {
    let html = t[s.valKey];
    let entryKey = t[s.keyKey];
    let usedFallback = langWideFallback;
    if (!hasContent(html)) {
      html = tAr[s.valKey];
      entryKey = tAr[s.keyKey];
      usedFallback = true;
    }
    if (!hasContent(html)) continue;

    // Per-name labels are heterogeneous in the source data — e.g. some
    // entries carry their own Arabic key. Show the actual entry label
    // when reading Arabic content; the generic UI label otherwise.
    const showEntryKey = (state.lang === 'ar' || usedFallback)
      && typeof entryKey === 'string' && entryKey.trim().length > 1;
    const headLabel = showEntryKey ? entryKey : ui(s.act);

    const section = document.createElement('section');
    section.className = 'section';
    section.id = `sec-${s.act}`;
    section.setAttribute('data-act', s.act);

    const head = document.createElement('div');
    head.className = 'section-head';
    const h3 = document.createElement('h3');
    h3.textContent = headLabel;
    head.appendChild(h3);
    section.appendChild(head);

    if (usedFallback) {
      const note = document.createElement('p');
      note.className = 'section-note';
      note.textContent = ui('ar_only');
      section.appendChild(note);
    }

    const body = document.createElement('div');
    body.className = 'section-body';
    if (usedFallback) {
      body.setAttribute('dir', 'rtl');
      body.setAttribute('lang', 'ar');
    }
    setSanitizedHTML(body, html);
    section.appendChild(body);

    sectionsEl.appendChild(section);
  }
}

function hasContent(html) {
  if (!html) return false;
  return shortText(html).length > 5;
}

/* ================ visual library (cards + videos) ================ */

function renderLibrary(name) {
  const lib = $('#library');
  const cardsPane = $('#lib-cards');

  const cards = pickByLang(state.cards.get(name.id) || []);

  cardsPane.replaceChildren();
  cards.forEach((c, i) => {
    const safe = safeCardPath(c.image);
    if (!safe) return;
    const fig = document.createElement('figure');
    fig.className = 'lib-card';
    const img = document.createElement('img');
    img.src = safe;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Hide the whole card if the image isn't on disk yet (e.g. backfill
    // workflow hasn't run for a freshly added entry).
    img.addEventListener('error', () => fig.remove(), { once: true });
    fig.appendChild(img);

    // Overlay download button — uses <a download> so same-origin assets
    // save directly without a fetch round-trip. The filename suggestion
    // is the localized name plus an index so multiple cards stay distinct.
    const dl = document.createElement('a');
    dl.className = 'lib-card-download';
    dl.href = safe;
    dl.download = suggestedDownloadName(name, safe, i);
    const label = ui('download');
    dl.setAttribute('aria-label', label);
    dl.setAttribute('title', label);
    dl.innerHTML = iconDownload();
    fig.appendChild(dl);

    cardsPane.appendChild(fig);
  });

  lib.hidden = cardsPane.children.length === 0;
}

function pickByLang(items) {
  if (!items.length) return [];
  const native = items.filter((i) => i.lang === state.lang);
  if (native.length) return native;
  const ar = items.filter((i) => i.lang === DEFAULT_LANG);
  return ar.length ? ar : items;
}

function safeCardPath(p) {
  if (typeof p !== 'string' || !p) return '';
  return /^(cards|images)\/[\w-]+\.(jpe?g|png|webp)$/i.test(p) ? p : '';
}

function suggestedDownloadName(nameRecord, path, index) {
  const ext = (path.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
  const tr = loc(nameRecord);
  const base = (tr.name || nameRecord.default_name)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'card';
  return `${base}-${index + 1}.${ext}`;
}

const NAV_LABEL = {
  ar: { prev: 'السابق', next: 'التالي' },
  ru: { prev: 'Предыдущее', next: 'Следующее' },
  en: { prev: 'Previous', next: 'Next' },
};

/**
 * Update the prev / next bar buttons' targets and accessible labels.
 * The buttons are static markup in the top bar, sitting next to home;
 * we only swap the href / aria-label / disabled state on each render.
 */
function renderPageNav(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const set = NAV_LABEL[state.lang] || NAV_LABEL.en;
  const rtl = document.documentElement.dir === 'rtl';
  fillBarNavLink($('#bar-prev'), prev, set.prev, rtl ? 'ArrowRight' : 'ArrowLeft');
  fillBarNavLink($('#bar-next'), next, set.next, rtl ? 'ArrowLeft' : 'ArrowRight');

  // Subtle, discoverable hint that arrow keys also work. Only shows on
  // devices that have a fine pointer (i.e. a keyboard is likely available).
  const hint = $('#kbd-hint');
  if (hint) {
    const prevKey = rtl ? '→' : '←';
    const nextKey = rtl ? '←' : '→';
    hint.textContent = `${prevKey} ${set.prev}  ·  ${nextKey} ${set.next}`;
    hint.hidden = !prev && !next;
  }
}

function fillBarNavLink(el, target, roleLabel, keyShortcut) {
  if (!el) return;
  const nameEl = el.querySelector('.bar-btn-name');
  if (!target) {
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('aria-label', roleLabel);
    el.removeAttribute('title');
    el.removeAttribute('aria-keyshortcuts');
    if (nameEl) nameEl.textContent = '';
    return;
  }
  el.removeAttribute('aria-disabled');
  el.href = `name.html?id=${target.id}`;
  const tr = loc(target);
  const fullLabel = `${roleLabel}: ${target.default_name}${tr.name ? ' — ' + tr.name : ''}`;
  el.setAttribute('aria-label', fullLabel);
  el.setAttribute('title', fullLabel);
  el.setAttribute('aria-keyshortcuts', keyShortcut);
  if (nameEl) nameEl.textContent = target.default_name;
}

function refreshPlayingUI() {
  const btn = $('.card-play', $('#hero'));
  if (!btn) return;
  const playing = audioCtrl.isPlaying(state.currentId);
  const loading = audioCtrl.isLoading(state.currentId);
  btn.classList.toggle('is-playing', playing);
  btn.classList.toggle('is-loading', loading);
  btn.innerHTML = loading ? iconLoading() : (playing ? iconPause() : iconPlay());
  btn.setAttribute('aria-label', ui(loading ? 'loading' : (playing ? 'pause' : 'play')));
}

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  const isFav = state.favorites.has(id);
  const btn = $('.card-fav', $('#hero'));
  if (btn) {
    btn.classList.toggle('is-fav', isFav);
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.setAttribute('aria-label', ui(isFav ? 'unfavorite' : 'favorite'));
  }
}

function bindEvents() {
  $('#hero').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'play') audioCtrl.toggle(state.currentId);
    if (action.dataset.action === 'fav') toggleFav(state.currentId);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    const step = (e.key === 'ArrowRight' ? 1 : -1) * dir;
    const idx = state.names.findIndex((n) => n.id === state.currentId);
    const next = state.names[idx + step];
    if (next) location.assign(`name.html?id=${next.id}`);
  });
}

function setSanitizedHTML(el, html) {
  el.replaceChildren();
  if (!html) return;
  const tmpl = document.createElement('template');
  tmpl.innerHTML = String(html);
  cleanNode(tmpl.content);
  el.appendChild(tmpl.content);
}

function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (!ALLOWED_HTML_TAGS.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ''));
        continue;
      }
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      cleanNode(child);
    } else if (child.nodeType !== Node.TEXT_NODE) {
      child.remove();
    }
  }
}

init().catch((err) => {
  console.error(err);
  $('#hero').removeAttribute('aria-busy');
  $('#hero').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
});
