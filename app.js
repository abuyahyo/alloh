const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';
const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const state = {
  names: [],
  visible: [],
  translations: new Map(),
  languages: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
  sort: localStorage.getItem('sort') || 'default',
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  view: localStorage.getItem('view') || 'rows',
  currentId: null,
  playingId: null,
  scrollTimer: null,
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
    .map((l) => `<option value="${escapeAttr(l.code)}">${escapeHtml(l.name)}</option>`)
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

  const html = state.visible.map((n, i) => cardMarkup(n, i)).join('');
  list.innerHTML = html;
}

function cardMarkup(n, i) {
  const t = localized(n);
  const translit = t.name || '';
  const bg = safePath(n.background_image);
  const isFav = state.favorites.has(n.id);
  const isPlaying = state.playingId === n.id;
  const delay = Math.min(i * 24, 360);

  return `
    <article class="name-card" data-id="${n.id}" tabindex="0" role="button" style="animation-delay: ${delay}ms">
      ${bg ? `<img class="card-bg" loading="lazy" decoding="async" src="${bg}" alt="">` : ''}
      <div class="card-arabic">${escapeHtml(n.default_name)}</div>
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

function togglePlay(id) {
  const name = state.names.find((n) => n.id === id);
  if (!name || !name.voice) {
    showToast('No audio for this name');
    return;
  }
  if (state.playingId === id) {
    audio.pause();
    return;
  }
  audio.pause();
  audio.src = name.voice;
  audio.play().then(() => {
    state.playingId = id;
    refreshPlayingUI();
  }).catch(() => {
    showToast('Could not play audio');
    state.playingId = null;
    refreshPlayingUI();
  });
}

audio.addEventListener('pause', () => {
  if (audio.ended || audio.currentTime === 0 || audio.currentTime === audio.duration) {
    state.playingId = null;
  } else {
    state.playingId = null;
  }
  refreshPlayingUI();
});
audio.addEventListener('ended', () => {
  state.playingId = null;
  refreshPlayingUI();
});
audio.addEventListener('error', () => {
  state.playingId = null;
  refreshPlayingUI();
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
  $$('.carousel-card').forEach((card) => {
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
  $$(`.name-card[data-id="${id}"] .card-fav, .carousel-card[data-id="${id}"] .card-fav`).forEach((b) => {
    b.classList.toggle('is-fav', isFav);
  });
}

/* ================ detail panel ================ */

async function openPanel(id) {
  const idx = state.visible.findIndex((n) => n.id === id);
  if (idx === -1) return;
  state.currentId = id;

  buildCarousel();
  updatePanelMeaning(id);

  const panel = $('#panel');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const carousel = $('#carousel');
  requestAnimationFrame(() => {
    const card = carousel.querySelector(`.carousel-card[data-id="${id}"]`);
    if (card) {
      const targetLeft = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
      carousel.scrollTo({ left: targetLeft, behavior: 'instant' });
    }
  });
}

function closePanel() {
  const panel = $('#panel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.currentId = null;
}

function buildCarousel() {
  const carousel = $('#carousel');
  carousel.innerHTML = state.visible.map((n) => carouselCardMarkup(n)).join('');
}

function carouselCardMarkup(n) {
  const t = localized(n);
  const translit = t.name || '';
  const bg = safePath(n.background_image);
  const isFav = state.favorites.has(n.id);
  const isPlaying = state.playingId === n.id;

  return `
    <article class="carousel-card" data-id="${n.id}">
      ${bg ? `<img class="card-bg" loading="lazy" decoding="async" src="${bg}" alt="">` : ''}
      <div class="card-arabic">${escapeHtml(n.default_name)}</div>
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

function updatePanelMeaning(id) {
  const name = state.names.find((n) => n.id === id);
  if (!name) return;
  const t = localized(name);
  setSanitizedHTML($('#meaning'), t.short_meaning_val);
}

function onCarouselScroll() {
  clearTimeout(state.scrollTimer);
  state.scrollTimer = setTimeout(() => {
    const carousel = $('#carousel');
    const cards = $$('.carousel-card', carousel);
    const center = carousel.scrollLeft + carousel.clientWidth / 2;
    let nearest = cards[0];
    let nearestDist = Infinity;
    for (const card of cards) {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < nearestDist) { nearestDist = dist; nearest = card; }
    }
    if (!nearest) return;
    const id = Number(nearest.dataset.id);
    if (id !== state.currentId) {
      state.currentId = id;
      updatePanelMeaning(id);
    }
  }, 80);
}

/* ================ share ================ */

async function shareCurrent() {
  if (!state.currentId) return;
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
      showToast('Copied to clipboard');
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') showToast('Share failed');
  }
}

/* ================ events ================ */

function bindGlobalEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir();
    renderList();
    if (state.currentId) {
      buildCarousel();
      updatePanelMeaning(state.currentId);
    }
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
  });

  const list = $('#list');
  list.addEventListener('click', (e) => {
    const card = e.target.closest('.name-card');
    if (!card || card.classList.contains('skeleton')) return;
    const id = Number(card.dataset.id);
    const action = e.target.closest('[data-action]');
    if (action) {
      e.stopPropagation();
      if (action.dataset.action === 'play') togglePlay(id);
      if (action.dataset.action === 'fav') toggleFav(id);
      return;
    }
    openPanel(id);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.name-card');
    if (!card || card.classList.contains('skeleton')) return;
    e.preventDefault();
    openPanel(Number(card.dataset.id));
  });

  const carousel = $('#carousel');
  carousel.addEventListener('click', (e) => {
    const card = e.target.closest('.carousel-card');
    if (!card) return;
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.stopPropagation();
    const id = Number(card.dataset.id);
    if (action.dataset.action === 'play') togglePlay(id);
    if (action.dataset.action === 'fav') toggleFav(id);
  });
  carousel.addEventListener('scroll', onCarouselScroll, { passive: true });

  $('.bar-btn.back', $('#panel')).addEventListener('click', closePanel);
  $('.bar-btn.share', $('#panel')).addEventListener('click', shareCurrent);

  $$('.more-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'scholars') {
        const name = state.names.find((n) => n.id === state.currentId);
        if (!name) return;
        const t = localized(name);
        showLongMeaning(t.meanings_key, t.meanings_val);
      } else {
        showToast('Coming soon');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    const panel = $('#panel');
    if (panel.getAttribute('aria-hidden') === 'true') return;
    if (e.key === 'Escape') closePanel();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
      const step = (e.key === 'ArrowRight' ? 1 : -1) * dir;
      const idx = state.visible.findIndex((n) => n.id === state.currentId);
      const next = state.visible[idx + step];
      if (next) {
        const card = $(`#carousel .carousel-card[data-id="${next.id}"]`);
        if (card) {
          const carousel = $('#carousel');
          carousel.scrollTo({
            left: card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2,
            behavior: 'smooth',
          });
        }
      }
    }
  });
}

/* ================ long-meaning sheet ================ */

function showLongMeaning(key, html) {
  if (!html) { showToast('No content'); return; }
  let sheet = $('#long-sheet');
  if (!sheet) {
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
    if (!$('#long-sheet-style')) {
      const s = document.createElement('style');
      s.id = 'long-sheet-style';
      s.textContent = `
        .long-sheet { position: fixed; inset: 0; z-index: 200; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
        .long-sheet.open { pointer-events: auto; }
        .long-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; transition: opacity .25s ease; }
        .long-sheet.open .long-backdrop { opacity: 1; }
        .long-card { position: relative; width: 100%; max-width: 720px; max-height: 80vh; background: var(--surface); border-radius: 24px 24px 0 0; padding: 1.75rem 1.5rem 2rem; transform: translateY(100%); transition: transform .35s var(--ease); overflow-y: auto; box-shadow: 0 -12px 40px rgba(0,0,0,.18); }
        .long-sheet.open .long-card { transform: translateY(0); }
        .long-close { position: absolute; top: 0.75rem; inset-inline-end: 0.85rem; width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.06); font-size: 1.4rem; line-height: 1; }
        .long-key { font-family: var(--font-arabic); font-size: 1.05rem; color: var(--ink); margin-bottom: 1rem; text-align: center; font-weight: 700; padding: 0 2rem; }
        .long-body { font-family: var(--font-arabic); font-size: 1.05rem; line-height: 1.85; color: var(--ink); }
        .long-body p + p { margin-top: 0.75rem; }
      `;
      document.head.appendChild(s);
    }
  }
  $('.long-key', sheet).textContent = key || '';
  setSanitizedHTML($('.long-body', sheet), html);
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
  return /^[\w./-]+$/.test(p) ? p : '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return String(s ?? '').replace(/["'<>&]/g, '');
}

init().catch((err) => {
  $('#list').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
