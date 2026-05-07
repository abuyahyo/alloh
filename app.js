import {
  RTL_LANGS, DEFAULT_LANG,
  $, $$,
  loadJSON, applyDir, buildLangSelect, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconHeart,
  showToast, createAudioController, attachImgFade,
} from './shared.js';

const SEARCH_PLACEHOLDER = {
  ar: 'البحث',
  ru: 'Поиск',
  en: 'Search',
};

const state = {
  names: [],
  visible: [],
  translations: new Map(),
  languages: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
  sort: localStorage.getItem('sort') || 'default',
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  view: localStorage.getItem('view') || 'rows',
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
  getLang: () => state.lang,
  onChange: refreshPlayingUI,
});

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

  buildLangSelect($('#lang'), state.languages, state.lang);
  applyDir(state.lang);
  applyView();
  applySort();
  applySearchPlaceholder();
  renderList();
}

function applyView() {
  $('#list').dataset.view = state.view;
  $('#grid-toggle').setAttribute('aria-pressed', state.view === 'grid');
}

function applySort() {
  $$('.chip').forEach((c) => {
    const active = c.dataset.sort === state.sort;
    c.classList.toggle('is-active', active);
    c.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function applySearchPlaceholder() {
  const ph = SEARCH_PLACEHOLDER[state.lang] || SEARCH_PLACEHOLDER.en;
  $('#search').setAttribute('placeholder', ph);
}

function loc(name) {
  return localized(state.translations, name, state.lang);
}

function getOrdered(filterText = '') {
  const q = filterText.trim().toLowerCase();
  let arr = state.names.slice();

  if (state.sort === 'alpha') {
    arr.sort((a, b) => {
      const ta = loc(a).name || a.default_name;
      const tb = loc(b).name || b.default_name;
      return String(ta).localeCompare(String(tb), state.lang);
    });
  } else if (state.sort === 'meaning') {
    arr.sort((a, b) => {
      const ma = shortText(loc(a).short_meaning_val);
      const mb = shortText(loc(b).short_meaning_val);
      return ma.localeCompare(mb, state.lang);
    });
  }

  if (q) {
    arr = arr.filter((n) => {
      const t = loc(n);
      return `${n.default_name} ${t.name || ''}`.toLowerCase().includes(q);
    });
  }

  return arr;
}

function renderList() {
  const list = $('#list');
  state.visible = getOrdered($('#search').value);

  list.removeAttribute('aria-busy');

  if (state.visible.length === 0) {
    list.innerHTML = '<p class="empty">لا توجد نتائج</p>';
    return;
  }

  list.innerHTML = state.visible.map((n, i) => cardMarkup(n, i)).join('');

  for (const img of list.querySelectorAll('img.card-bg.is-loading')) {
    attachImgFade(img);
  }
  for (const img of list.querySelectorAll('img.card-arabic-svg')) {
    attachCalligraphyFallback(img);
  }
}

// If the SVG calligraphy isn't on disk (5 entries are missing in the source
// dump), swap it for the default Unicode name so the card never renders blank.
function attachCalligraphyFallback(img) {
  img.addEventListener('error', () => {
    const text = img.dataset.fallback || '';
    img.replaceWith(document.createTextNode(text));
  }, { once: true });
}

function cardMarkup(n, i) {
  const t = loc(n);
  const translit = t.name || '';
  const bg = safePath(n.background_image);
  const calligraphy = safeSvgPath(n.image);
  const isFav = state.favorites.has(n.id);
  const isPlaying = audioCtrl.isPlaying(n.id);
  const delay = Math.min(i * 24, 360);
  const eager = i < 3;
  const ariaLabel = `${n.default_name}${translit ? ', ' + translit : ''}`;
  const tint = safeColor(n.color);
  const cardStyle = `animation-delay: ${delay}ms${tint ? `; background-color: ${tint}` : ''}`;
  const calligraphyHtml = calligraphy
    ? `<img class="card-arabic-svg" src="${escapeHtml(calligraphy)}" alt="${escapeHtml(n.default_name)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" data-fallback="${escapeHtml(n.default_name)}">`
    : escapeHtml(n.default_name);

  return `
    <article class="name-card" data-id="${n.id}" style="${cardStyle}">
      <a class="card-link" href="name.html?id=${n.id}" aria-label="${escapeHtml(ariaLabel)}">
        ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${eager ? 'high' : 'low'}">` : ''}
        <span class="card-arabic">${calligraphyHtml}</span>
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

function refreshPlayingUI() {
  $$('.name-card').forEach((card) => {
    const id = Number(card.dataset.id);
    const btn = $('.card-play', card);
    if (!btn) return;
    const playing = audioCtrl.isPlaying(id);
    btn.classList.toggle('is-playing', playing);
    btn.innerHTML = playing ? iconPause() : iconPlay();
  });
}

function toggleFav(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
  const isFav = state.favorites.has(id);
  $$(`.name-card[data-id="${id}"] .card-fav`).forEach((b) => {
    b.classList.toggle('is-fav', isFav);
  });
}

function bindGlobalEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir(state.lang);
    applySearchPlaceholder();
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
  if (action.dataset.action === 'play') audioCtrl.toggle(id);
  if (action.dataset.action === 'fav') toggleFav(id);
}

init().catch((err) => {
  $('#list').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
