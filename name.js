import {
  DEFAULT_LANG,
  $, $$,
  loadJSON, applyDir, buildLangSelect, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconLoading, iconHeart, iconDownload,
  showToast, createAudioController, attachImgFade,
  bindThemeToggle, tFor,
} from './shared.js';

const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const SECTIONS = [
  { act: 'meanings', valKey: 'meanings_val', keyKey: 'meanings_key' },
  { act: 'evidence', valKey: 'evidence_val', keyKey: 'evidence_key' },
  { act: 'effects',  valKey: 'effects_val',  keyKey: 'effects_key' },
  { act: 'pray',     valKey: 'pray_val',     keyKey: 'pray_key' },
  { act: 'mercy',    valKey: 'mercy_val',    keyKey: 'mercy_key' },
  { act: 'benefits', valKey: 'benefits_val', keyKey: 'benefits_key' },
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
  videos: new Map(),  // gods_name_id -> [{ title, video_url, thumbnail_url, lang }, …]
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
  getLang: () => state.lang,
  onChange: refreshPlayingUI,
});

let tocObserver = null;
let syncThemeLabel = () => {};

/**
 * iOS Safari renders fixed-position elements relative to the layout
 * viewport, which on portrait devices extends *behind* the bottom URL
 * bar — so a pill with bottom:1rem lands hidden under the URL bar. The
 * visualViewport API reports the actual visible region, and the
 * difference is how much of the layout viewport is currently obscured
 * at the bottom. We feed it back into the CSS as --vv-bottom and let
 * the pill add it to its bottom offset. No-op on browsers without the
 * API, which already position the pill correctly.
 */
function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const obscured = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty('--vv-bottom', `${obscured}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

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
  trackVisualViewport();
  syncThemeLabel = bindThemeToggle($('#theme-toggle'), () => state.lang);

  let names, trans, langs, cards, videos;
  try {
    [names, trans, langs, cards, videos] = await Promise.all([
      loadJSON('json/names.json'),
      loadJSON('json/name_translations.json'),
      loadJSON('json/languages.json'),
      loadJSON('json/cards.json').catch((e) => { console.warn('cards.json:', e); return []; }),
      loadJSON('json/videos.json').catch((e) => { console.warn('videos.json:', e); return []; }),
    ]);
  } catch (err) {
    console.error(err);
    $('#hero').removeAttribute('aria-busy');
    $('#hero').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
    return;
  }

  state.names = names.sort((a, b) => a.display_order - b.display_order);

  const transLangs = new Set(trans.map((t) => t.lang));
  state.languages = langs.filter((l) => transLangs.has(l.code));

  for (const t of trans) {
    if (!state.translations.has(t.gods_name_id)) state.translations.set(t.gods_name_id, {});
    state.translations.get(t.gods_name_id)[t.lang] = t;
  }

  for (const c of cards) {
    if (!state.cards.has(c.gods_name_id)) state.cards.set(c.gods_name_id, []);
    state.cards.get(c.gods_name_id).push(c);
  }
  for (const v of videos) {
    if (!state.videos.has(v.gods_name_id)) state.videos.set(v.gods_name_id, []);
    state.videos.get(v.gods_name_id).push(v);
  }

  if (!state.languages.find((l) => l.code === state.lang)) state.lang = DEFAULT_LANG;

  buildLangSelect($('#lang'), state.languages, state.lang);
  applyLangChrome();
  render();
}

function applyLangChrome() {
  applyDir(state.lang);
  $('#lang').setAttribute('aria-label', ui('language'));
  const home = $('#float-home');
  if (home) home.setAttribute('aria-label', ui('home'));
  const share = $('.bar-btn.share');
  if (share) share.setAttribute('aria-label', ui('share'));
  syncThemeLabel();
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
  renderSectionsAndTOC(name);
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
 * Build the (visible) sections and the matching TOC chips. Sections with no
 * content (after Arabic fallback) are skipped entirely so the page only
 * shows what's actually there.
 */
function renderSectionsAndTOC(name) {
  const t = loc(name);
  const tAr = (state.translations.get(name.id) || {}).ar || {};
  const sectionsEl = $('#sections');
  const tocInner = $('#toc-inner');
  const tocNav = $('#toc');

  sectionsEl.replaceChildren();
  tocInner.replaceChildren();
  if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }

  const visible = [];

  for (const s of SECTIONS) {
    let html = t[s.valKey];
    let entryKey = t[s.keyKey];
    let usedFallback = false;
    if (!hasContent(html)) {
      html = tAr[s.valKey];
      entryKey = tAr[s.keyKey];
      usedFallback = true;
    }
    if (!hasContent(html)) continue;

    // Per-name labels are heterogeneous in the source data — e.g. some
    // entries carry "وقفات" under effects_key. Show the actual entry label
    // when reading Arabic content; the generic UI label otherwise.
    const showEntryKey = (state.lang === 'ar' || usedFallback)
      && typeof entryKey === 'string' && entryKey.trim().length > 1;
    const headLabel = showEntryKey ? entryKey : ui(s.act);
    const tocLabel = ui(s.act);

    visible.push({ act: s.act, headLabel, tocLabel });

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

  if (visible.length === 0) {
    tocNav.hidden = true;
    return;
  }
  tocNav.hidden = false;

  // Sticky name pill anchors the chip strip so the user sees which name
  // they're reading even after the TOC has stuck to the top of the viewport.
  const namePill = document.createElement('span');
  namePill.className = 'toc-name-pill';
  namePill.textContent = name.default_name;
  tocInner.appendChild(namePill);

  for (const v of visible) {
    const a = document.createElement('a');
    a.className = 'toc-chip';
    a.href = `#sec-${v.act}`;
    a.dataset.act = v.act;
    a.textContent = v.tocLabel;
    tocInner.appendChild(a);
  }

  // Track which section is in view so the active chip stays in sync.
  if ('IntersectionObserver' in window) {
    tocObserver = new IntersectionObserver((entries) => {
      const onScreen = entries.filter((e) => e.isIntersecting);
      if (!onScreen.length) return;
      onScreen.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const act = onScreen[0].target.dataset.act;
      $$('.toc-chip', tocInner).forEach((c) => {
        const current = c.dataset.act === act;
        c.classList.toggle('is-current', current);
        if (current) c.setAttribute('aria-current', 'location');
        else c.removeAttribute('aria-current');
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    $$('.section', sectionsEl).forEach((s) => tocObserver.observe(s));
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
  const videosPane = $('#lib-videos');
  const cardsTab = $('.lib-tab[data-tab="cards"]');
  const videosTab = $('.lib-tab[data-tab="videos"]');

  const cards = pickByLang(state.cards.get(name.id) || []);
  const videos = pickByLang(state.videos.get(name.id) || []);

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

  videosPane.replaceChildren();
  for (const v of videos) {
    const id = extractYouTubeId(v.video_url);
    if (!id) continue;
    videosPane.appendChild(buildVideoCard(v, id));
  }

  cardsTab.hidden = cardsPane.children.length === 0;
  videosTab.hidden = videosPane.children.length === 0;

  if (cardsTab.hidden && videosTab.hidden) {
    lib.hidden = true;
    return;
  }
  lib.hidden = false;

  // If the active tab disappeared (e.g. switched to a name with only videos),
  // fall back to whichever tab still has content.
  const active = $('.lib-tab.is-active');
  if (!active || active.hidden) {
    selectLibraryTab(cardsTab.hidden ? 'videos' : 'cards');
  }
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

function extractYouTubeId(url) {
  if (typeof url !== 'string') return '';
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

function buildVideoCard(v, id) {
  const a = document.createElement('a');
  a.className = 'lib-video';
  a.href = v.video_url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', v.title || 'YouTube video');

  const thumb = document.createElement('img');
  thumb.className = 'lib-video-thumb';
  thumb.src = v.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.decoding = 'async';
  thumb.addEventListener('error', () => {
    thumb.src = `https://img.youtube.com/vi/${id}/0.jpg`;
  }, { once: true });

  const overlay = document.createElement('span');
  overlay.className = 'lib-video-play';
  overlay.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  const title = document.createElement('span');
  title.className = 'lib-video-title';
  title.textContent = v.title || '';

  a.appendChild(thumb);
  a.appendChild(overlay);
  a.appendChild(title);
  return a;
}

function selectLibraryTab(tab) {
  $$('.lib-tab').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.setAttribute('tabindex', active ? '0' : '-1');
  });
  $('#lib-cards').hidden = tab !== 'cards';
  $('#lib-videos').hidden = tab !== 'videos';
}

const NAV_LABEL = {
  ar: { prev: 'السابق', next: 'التالي' },
  ru: { prev: 'Предыдущее', next: 'Следующее' },
  en: { prev: 'Previous', next: 'Next' },
};

/**
 * Populate the floating prev / home / next pill at the bottom of the
 * viewport. Home is static markup; only the prev / next links need
 * per-render updates (target id, accessible label, disabled state).
 */
function renderPageNav(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const set = NAV_LABEL[state.lang] || NAV_LABEL.en;
  const rtl = document.documentElement.dir === 'rtl';
  fillFloatNavLink($('#float-prev'), prev, set.prev, rtl ? 'ArrowRight' : 'ArrowLeft');
  fillFloatNavLink($('#float-next'), next, set.next, rtl ? 'ArrowLeft' : 'ArrowRight');

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

function fillFloatNavLink(el, target, roleLabel, keyShortcut) {
  if (!target) {
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
    el.setAttribute('aria-label', roleLabel);
    el.removeAttribute('title');
    el.removeAttribute('aria-keyshortcuts');
    return;
  }
  el.removeAttribute('aria-disabled');
  el.href = `name.html?id=${target.id}`;
  const tr = loc(target);
  const fullLabel = `${roleLabel}: ${target.default_name}${tr.name ? ' — ' + tr.name : ''}`;
  el.setAttribute('aria-label', fullLabel);
  el.setAttribute('title', fullLabel);
  el.setAttribute('aria-keyshortcuts', keyShortcut);
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

async function shareCurrent() {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const t = loc(name);
  const text = `${name.default_name} — ${t.name || ''}\n${shortText(t.short_meaning_val).slice(0, 200)}`;
  const url = location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: name.default_name, text, url });
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast(ui('copied'));
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') showToast(ui('share_failed'));
  }
}

function bindEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyLangChrome();
    render();
  });

  $('#hero').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'play') audioCtrl.toggle(state.currentId);
    if (action.dataset.action === 'fav') toggleFav(state.currentId);
  });

  $('.bar-btn.share').addEventListener('click', shareCurrent);

  const tablist = $('#lib-tabs');
  tablist.addEventListener('click', (e) => {
    const btn = e.target.closest('.lib-tab');
    if (btn && !btn.hidden) selectLibraryTab(btn.dataset.tab);
  });
  // Standard ARIA tabs keyboard support: arrow keys cycle, Home/End jump to ends.
  tablist.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = $$('.lib-tab', tablist).filter((t) => !t.hidden);
    if (!tabs.length) return;
    const rtl = document.documentElement.dir === 'rtl';
    const currentIdx = tabs.findIndex((t) => t === document.activeElement) ;
    const i = currentIdx < 0 ? tabs.findIndex((t) => t.classList.contains('is-active')) : currentIdx;
    let next = i;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else {
      const delta = (e.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
      next = (i + delta + tabs.length) % tabs.length;
    }
    e.preventDefault();
    selectLibraryTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    // Don't hijack arrow keys when focus is inside the tablist — those are
    // handled by the tablist's own listener above.
    if (e.target && e.target.closest && e.target.closest('#lib-tabs')) return;
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
