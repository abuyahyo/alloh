import {
  DEFAULT_LANG,
  $, $$,
  loadJSON, applyDir, buildLangSelect, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconHeart,
  showToast, createAudioController, attachImgFade,
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

const UI_STRINGS = {
  ar: {
    short_meaning: 'المعنى المختصر',
    meanings: 'أقوال العلماء',
    evidence: 'الأدلة',
    effects: 'الآثار الإيمانية',
    pray: 'الدعاء بالاسم',
    mercy: 'وقفات',
    benefits: 'فوائد وأحكام',
    no_content: 'لا يوجد محتوى',
    ar_only: 'هذا القسم متوفر بالعربية فقط',
    copied: 'تم النسخ',
    share_failed: 'تعذر المشاركة',
    library: 'مكتبة المرئيات',
    cards: 'البطاقات',
    videos: 'مقاطع فيديو',
  },
  ru: {
    short_meaning: 'Краткое значение',
    meanings: 'Слова учёных',
    evidence: 'Доказательства',
    effects: 'Влияние на веру',
    pray: 'Дуа и поминание',
    mercy: 'Размышления',
    benefits: 'Польза и предписания',
    no_content: 'Содержимое отсутствует',
    ar_only: 'Этот раздел доступен только на арабском',
    copied: 'Скопировано',
    share_failed: 'Не удалось поделиться',
    library: 'Медиатека',
    cards: 'Карточки',
    videos: 'Видео',
  },
};
function ui(key) {
  const set = UI_STRINGS[state.lang] || UI_STRINGS[DEFAULT_LANG];
  return set[key] || UI_STRINGS[DEFAULT_LANG][key] || '';
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

async function init() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('id'));
  if (!Number.isFinite(id)) {
    location.replace('index.html');
    return;
  }
  state.currentId = id;

  bindEvents();

  const [names, trans, langs, cards, videos] = await Promise.all([
    loadJSON('json/names.json'),
    loadJSON('json/name_translations.json'),
    loadJSON('json/languages.json'),
    loadJSON('json/cards.json').catch(() => []),
    loadJSON('json/videos.json').catch(() => []),
  ]);

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
  applyDir(state.lang);
  render();
}

function loc(name) {
  return localized(state.translations, name, state.lang);
}

function render() {
  const name = state.names.find((n) => n.id === state.currentId);
  const hero = $('#hero');
  if (!name) {
    hero.removeAttribute('aria-busy');
    hero.innerHTML = '<p class="empty">Not found</p>';
    return;
  }

  const t = loc(name);
  const translit = t.name || '';
  const bg = safePath(name.background_image);
  const isFav = state.favorites.has(name.id);
  const isPlaying = audioCtrl.isPlaying(name.id);
  const tint = safeColor(name.color);

  document.title = `${name.default_name}${translit ? ' — ' + translit : ''} | هو الله`;
  if (tint) hero.style.backgroundColor = tint;

  const calligraphy = safeSvgPath(name.image);
  const calligraphyHtml = calligraphy
    ? `<img class="card-arabic-svg" src="${escapeHtml(calligraphy)}" alt="${escapeHtml(name.default_name)}" loading="eager" decoding="async" data-fallback="${escapeHtml(name.default_name)}">`
    : escapeHtml(name.default_name);

  hero.removeAttribute('aria-busy');
  hero.innerHTML = `
    ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high">` : ''}
    <span class="card-arabic">${calligraphyHtml}</span>
    <div class="card-foot">
      <button class="card-icon-btn card-play${isPlaying ? ' is-playing' : ''}" data-action="play" aria-label="Play" type="button">
        ${isPlaying ? iconPause() : iconPlay()}
      </button>
      <span class="card-translit">${escapeHtml(translit)}</span>
      <button class="card-icon-btn card-fav${isFav ? ' is-fav' : ''}" data-action="fav" aria-label="Favorite" type="button">
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
  renderFab(name);
}

function renderUiStrings() {
  $$('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const text = ui(key);
    if (!text) return;
    if (el.classList.contains('section-title')) {
      const span = el.querySelector('span') || el;
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
        c.classList.toggle('is-current', c.dataset.act === act);
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
  for (const c of cards) {
    const safe = safeCardPath(c.image);
    if (!safe) continue;
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
    cardsPane.appendChild(fig);
  }

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
  });
  $('#lib-cards').hidden = tab !== 'cards';
  $('#lib-videos').hidden = tab !== 'videos';
}

/**
 * The floating bar at the bottom shows three actions: prev, home, next. The
 * left/right slots map to display_order ∓ 1 in LTR, but flip in RTL so the
 * leftward arrow always points "forward in the reading direction" — which
 * for an Arabic reader is the next name in the list.
 */
function renderFab(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const isRTL = document.documentElement.dir === 'rtl';
  setFabLink($('#fab-left'), isRTL ? next : prev, isRTL ? 'next' : 'prev');
  setFabLink($('#fab-right'), isRTL ? prev : next, isRTL ? 'prev' : 'next');
}

function setFabLink(el, target, role) {
  if (!target) {
    el.setAttribute('aria-disabled', 'true');
    el.removeAttribute('href');
    el.removeAttribute('title');
    el.setAttribute('aria-label', role === 'prev' ? 'Previous' : 'Next');
    return;
  }
  el.removeAttribute('aria-disabled');
  el.href = `name.html?id=${target.id}`;
  const tr = loc(target);
  const label = `${role === 'prev' ? 'Previous' : 'Next'}: ${target.default_name}${tr.name ? ' — ' + tr.name : ''}`;
  el.title = label;
  el.setAttribute('aria-label', label);
}

function refreshPlayingUI() {
  const btn = $('.card-play', $('#hero'));
  if (!btn) return;
  const playing = audioCtrl.isPlaying(state.currentId);
  btn.classList.toggle('is-playing', playing);
  btn.innerHTML = playing ? iconPause() : iconPlay();
}

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  const btn = $('.card-fav', $('#hero'));
  if (btn) btn.classList.toggle('is-fav', state.favorites.has(id));
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
    applyDir(state.lang);
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

  $$('.lib-tab').forEach((btn) => {
    btn.addEventListener('click', () => selectLibraryTab(btn.dataset.tab));
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
  $('#hero').removeAttribute('aria-busy');
  $('#hero').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
