const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';
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
    more: 'المزيد عن هذا الاسم',
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
  },
  ru: {
    short_meaning: 'Краткое значение',
    more: 'Подробнее об этом имени',
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
  playingId: null,
  missingAudio: new Set(),
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const audio = $('#audio');

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('id'));
  if (!Number.isFinite(id)) {
    location.replace('index.html');
    return;
  }
  state.currentId = id;

  bindEvents();

  const [names, trans, langs] = await Promise.all([
    loadJSON('json/names.json'),
    loadJSON('json/name_translations.json'),
    loadJSON('json/languages.json'),
  ]);

  state.names = names.sort((a, b) => a.display_order - b.display_order);

  const transLangs = new Set(trans.map((t) => t.lang));
  state.languages = langs.filter((l) => transLangs.has(l.code));

  for (const t of trans) {
    if (!state.translations.has(t.gods_name_id)) state.translations.set(t.gods_name_id, {});
    state.translations.get(t.gods_name_id)[t.lang] = t;
  }

  if (!state.languages.find((l) => l.code === state.lang)) state.lang = DEFAULT_LANG;

  buildLangSelect();
  applyDir();
  render();
}

function buildLangSelect() {
  const sel = $('#lang');
  sel.innerHTML = state.languages
    .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)}</option>`)
    .join('');
  sel.value = state.lang;
}

function applyDir() {
  const dir = RTL_LANGS.has(state.lang) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', state.lang);
}

function localized(name) {
  const tr = state.translations.get(name.id) || {};
  return tr[state.lang] || tr[DEFAULT_LANG] || {};
}

function render() {
  const name = state.names.find((n) => n.id === state.currentId);
  const hero = $('#hero');
  if (!name) {
    hero.removeAttribute('aria-busy');
    hero.innerHTML = '<p class="empty">Not found</p>';
    return;
  }

  const t = localized(name);
  const translit = t.name || '';
  const bg = safePath(name.background_image);
  const isFav = state.favorites.has(name.id);
  const isPlaying = state.playingId === name.id;
  const tint = safeColor(name.color);

  document.title = `${name.default_name}${translit ? ' — ' + translit : ''} | هو الله`;
  if (tint) hero.style.backgroundColor = tint;

  hero.removeAttribute('aria-busy');
  hero.innerHTML = `
    ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high" onload="this.classList.remove('is-loading')" onerror="this.remove()">` : ''}
    <span class="card-arabic">${escapeHtml(name.default_name)}</span>
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
  const heroImg = hero.querySelector('img.card-bg.is-loading');
  if (heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
    heroImg.classList.remove('is-loading');
  }

  setSanitizedHTML($('#meaning'), t.short_meaning_val);
  renderUiStrings();
  renderSectionAvailability(name);
  renderPrevNext(name);
}

function renderUiStrings() {
  $$('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const text = ui(key);
    if (!text) return;
    if (el.classList.contains('section-title') || el.classList.contains('more-title')) {
      const span = el.querySelector('span') || el;
      span.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

function renderSectionAvailability(name) {
  const t = localized(name);
  const tAr = (state.translations.get(name.id) || {}).ar || {};
  for (const s of SECTIONS) {
    const btn = $(`.more-btn[data-act="${s.act}"]`);
    if (!btn) continue;
    const has = hasContent(t[s.valKey]) || hasContent(tAr[s.valKey]);
    btn.disabled = !has;
    btn.classList.toggle('is-disabled', !has);
  }
}

function hasContent(html) {
  if (!html) return false;
  return shortText(html).length > 5;
}

function renderPrevNext(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const prevEl = $('#prev');
  const nextEl = $('#next');
  setNavLink(prevEl, prev, 'prev');
  setNavLink(nextEl, next, 'next');
}

function setNavLink(el, name, dir) {
  if (!name) {
    el.style.visibility = 'hidden';
    el.removeAttribute('href');
    el.textContent = '';
    return;
  }
  el.style.visibility = '';
  el.href = `name.html?id=${name.id}`;
  const t = localized(name);
  const arrow = (dir === 'prev') === (document.documentElement.dir === 'rtl') ? '←' : '→';
  el.innerHTML = `<span class="nav-arrow" aria-hidden="true">${arrow}</span><span class="nav-text">${escapeHtml(name.default_name)}${t.name ? `<small>${escapeHtml(t.name)}</small>` : ''}</span>`;
}

/* ================ inline audio ================ */

const NO_AUDIO_MSG = {
  ar: 'لا يوجد تسجيل صوتي لهذا الاسم',
  ru: 'Аудио недоступно',
  en: 'No audio for this name',
};
function audioMissingMsg() { return NO_AUDIO_MSG[state.lang] || NO_AUDIO_MSG.en; }

async function togglePlay(id) {
  const name = state.names.find((n) => n.id === id);
  const safeVoice = name ? safePath(name.voice) : '';
  if (!safeVoice || state.missingAudio.has(id)) {
    showToast(audioMissingMsg());
    refreshPlayingUI();
    return;
  }
  if (state.playingId === id && !audio.paused) {
    audio.pause();
    state.playingId = null;
    refreshPlayingUI();
    return;
  }
  audio.pause();
  audio.src = safeVoice;
  state.playingId = id;
  refreshPlayingUI();
  try {
    await audio.play();
  } catch {
    state.missingAudio.add(id);
    if (state.playingId === id) state.playingId = null;
    refreshPlayingUI();
    showToast(audioMissingMsg());
  }
}

function refreshPlayingUI() {
  const btn = $('.card-play', $('#hero'));
  if (!btn) return;
  const playing = state.currentId === state.playingId;
  btn.classList.toggle('is-playing', playing);
  btn.innerHTML = playing ? iconPause() : iconPlay();
}

audio.addEventListener('ended', () => {
  state.playingId = null;
  refreshPlayingUI();
});
audio.addEventListener('error', () => {
  if (state.playingId != null) {
    state.missingAudio.add(state.playingId);
    state.playingId = null;
    refreshPlayingUI();
    showToast(audioMissingMsg());
  }
});

/* ================ favorites ================ */

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  const isFav = state.favorites.has(id);
  const btn = $('.card-fav', $('#hero'));
  if (btn) btn.classList.toggle('is-fav', isFav);
}

/* ================ share ================ */

async function shareCurrent() {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const t = localized(name);
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

/* ================ events ================ */

function bindEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir();
    render();
  });

  $('#hero').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'play') togglePlay(state.currentId);
    if (action.dataset.action === 'fav') toggleFav(state.currentId);
  });

  $$('.more-btn').forEach((btn) => {
    btn.addEventListener('click', () => onMoreAction(btn.dataset.act));
  });

  $('.bar-btn.share').addEventListener('click', shareCurrent);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
      const step = (e.key === 'ArrowRight' ? 1 : -1) * dir;
      const idx = state.names.findIndex((n) => n.id === state.currentId);
      const next = state.names[idx + step];
      if (next) location.assign(`name.html?id=${next.id}`);
    }
  });
}

function onMoreAction(act) {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const section = SECTIONS.find((s) => s.act === act);
  if (!section) return;
  const t = localized(name);
  const tAr = (state.translations.get(name.id) || {}).ar || {};
  let html = t[section.valKey];
  let usedFallback = false;
  if (!hasContent(html)) {
    html = tAr[section.valKey];
    usedFallback = true;
  }
  if (!hasContent(html)) { showToast(ui('no_content')); return; }
  showLongMeaning(ui(act), html, usedFallback ? ui('ar_only') : '');
}

/* ================ long-meaning sheet ================ */

function ensureSheet() {
  let sheet = $('#long-sheet');
  if (sheet) return sheet;
  sheet = document.createElement('div');
  sheet.id = 'long-sheet';
  sheet.className = 'long-sheet';
  sheet.innerHTML = `
    <div class="long-backdrop"></div>
    <div class="long-card">
      <button class="long-close" aria-label="Close" type="button">×</button>
      <h4 class="long-key"></h4>
      <div class="long-body"></div>
    </div>
  `;
  sheet.querySelector('.long-backdrop').addEventListener('click', () => sheet.classList.remove('open'));
  sheet.querySelector('.long-close').addEventListener('click', () => sheet.classList.remove('open'));
  document.body.appendChild(sheet);
  return sheet;
}

function showLongMeaning(key, html, note) {
  if (!html) { showToast(ui('no_content')); return; }
  const sheet = ensureSheet();
  $('.long-key', sheet).textContent = key || '';
  const body = $('.long-body', sheet);
  body.replaceChildren();
  if (note) {
    const noteEl = document.createElement('p');
    noteEl.className = 'long-note';
    noteEl.textContent = note;
    body.appendChild(noteEl);
    body.setAttribute('dir', 'rtl');
    body.setAttribute('lang', 'ar');
  } else {
    body.removeAttribute('dir');
    body.removeAttribute('lang');
  }
  const fragHost = document.createElement('div');
  setSanitizedHTML(fragHost, html);
  while (fragHost.firstChild) body.appendChild(fragHost.firstChild);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function showCalligraphy(title, src) {
  const sheet = ensureSheet();
  $('.long-key', sheet).textContent = title || '';
  const body = $('.long-body', sheet);
  body.replaceChildren();
  const img = document.createElement('img');
  img.src = src;
  img.alt = title || '';
  img.className = 'long-image';
  img.loading = 'lazy';
  img.decoding = 'async';
  body.appendChild(img);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

/* ================ toast ================ */

function showToast(msg) {
  const toast = $('#toast');
  toast.hidden = false;
  toast.textContent = msg;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 1800);
}

/* ================ icons ================ */

function iconPlay() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>`;
}
function iconPause() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
}
function iconHeart() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-linejoin="round"/></svg>`;
}

/* ================ sanitization & helpers ================ */

function shortText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
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

function safePath(p) {
  if (typeof p !== 'string' || !p) return '';
  return /^(voices|images)\/[\w-]+\.[a-z0-9]+$/i.test(p) ? p : '';
}

function safeColor(c) {
  if (typeof c !== 'string') return '';
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init().catch((err) => {
  $('#hero').removeAttribute('aria-busy');
  $('#hero').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
