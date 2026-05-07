const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';

const state = {
  names: [],
  visible: [],
  translations: new Map(),
  languages: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
  sort: localStorage.getItem('sort') || 'default',
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  view: localStorage.getItem('view') || 'rows',
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
  bindGlobalEvents();

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
  applyView();
  applySort();
  renderList();
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

function applyView() {
  $('#list').dataset.view = state.view;
  const btn = $('#grid-toggle');
  btn.setAttribute('aria-pressed', state.view === 'grid');
}

function applySort() {
  $$('.chip').forEach((c) => {
    const active = c.dataset.sort === state.sort;
    c.classList.toggle('is-active', active);
    c.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function localized(name) {
  const tr = state.translations.get(name.id) || {};
  return tr[state.lang] || tr[DEFAULT_LANG] || {};
}

function getOrdered(filterText = '') {
  const q = filterText.trim().toLowerCase();
  let arr = state.names.slice();

  if (state.sort === 'alpha') {
    arr.sort((a, b) => {
      const ta = localized(a).name || a.default_name;
      const tb = localized(b).name || b.default_name;
      return String(ta).localeCompare(String(tb), state.lang);
    });
  } else if (state.sort === 'meaning') {
    arr.sort((a, b) => {
      const ma = shortText(localized(a).short_meaning_val);
      const mb = shortText(localized(b).short_meaning_val);
      return ma.localeCompare(mb, state.lang);
    });
  }

  if (q) {
    arr = arr.filter((n) => {
      const t = localized(n);
      return `${n.default_name} ${t.name || ''}`.toLowerCase().includes(q);
    });
  }

  return arr;
}

function renderList() {
  const list = $('#list');
  const filter = $('#search').value;
  state.visible = getOrdered(filter);

  list.removeAttribute('aria-busy');

  if (state.visible.length === 0) {
    list.innerHTML = '<p class="empty">لا توجد نتائج</p>';
    return;
  }

  list.innerHTML = state.visible.map((n, i) => cardMarkup(n, i)).join('');

  for (const img of list.querySelectorAll('img.card-bg.is-loading')) {
    if (img.complete && img.naturalWidth > 0) img.classList.remove('is-loading');
  }
}

function cardMarkup(n, i) {
  const t = localized(n);
  const translit = t.name || '';
  const bg = safePath(n.background_image);
  const isFav = state.favorites.has(n.id);
  const isPlaying = state.playingId === n.id;
  const delay = Math.min(i * 24, 360);
  const eager = i < 3;
  const ariaLabel = `${n.default_name}${translit ? ', ' + translit : ''}`;
  const tint = safeColor(n.color);
  const cardStyle = `animation-delay: ${delay}ms${tint ? `; background-color: ${tint}` : ''}`;

  return `
    <article class="name-card" data-id="${n.id}" style="${cardStyle}">
      <a class="card-link" href="name.html?id=${n.id}" aria-label="${escapeHtml(ariaLabel)}">
        ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${eager ? 'high' : 'low'}" onload="this.classList.remove('is-loading')" onerror="this.remove()">` : ''}
        <span class="card-arabic">${escapeHtml(n.default_name)}</span>
      </a>
      <div class="card-foot">
        <button class="card-icon-btn card-play${isPlaying ? ' is-playing' : ''}" data-action="play" aria-label="Play" type="button">
          ${isPlaying ? iconPause() : iconPlay()}
        </button>
        <span class="card-translit">${escapeHtml(translit)}</span>
        <button class="card-icon-btn card-fav${isFav ? ' is-fav' : ''}" data-action="fav" aria-label="Favorite" type="button">
          ${iconHeart()}
        </button>
      </div>
    </article>
  `;
}

function iconPlay() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>`;
}
function iconPause() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
}
function iconHeart() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-linejoin="round"/></svg>`;
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

function refreshPlayingUI() {
  $$('.name-card').forEach((card) => {
    const id = Number(card.dataset.id);
    const btn = $('.card-play', card);
    if (!btn) return;
    const playing = id === state.playingId;
    btn.classList.toggle('is-playing', playing);
    btn.innerHTML = playing ? iconPause() : iconPlay();
  });
}

/* ================ favorites ================ */

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  const isFav = state.favorites.has(id);
  $$(`.name-card[data-id="${id}"] .card-fav`).forEach((b) => {
    b.classList.toggle('is-fav', isFav);
  });
}

/* ================ events ================ */

function bindGlobalEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir();
    renderList();
  });

  let searchTimer;
  $('#search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 120);
  });

  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.sort = chip.dataset.sort;
      localStorage.setItem('sort', state.sort);
      applySort();
      renderList();
    });
  });

  $('#grid-toggle').addEventListener('click', () => {
    state.view = state.view === 'grid' ? 'rows' : 'grid';
    localStorage.setItem('view', state.view);
    applyView();
    renderList();
  });

  $('#list').addEventListener('click', onListClick);
}

function onListClick(e) {
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const card = action.closest('.name-card');
  if (!card) return;
  e.preventDefault();
  e.stopPropagation();
  const id = Number(card.dataset.id);
  if (action.dataset.action === 'play') togglePlay(id);
  if (action.dataset.action === 'fav') toggleFav(id);
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

/* ================ helpers ================ */

function shortText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
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
  $('#list').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
