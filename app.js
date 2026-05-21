import {
  $, $$,
  loadJSON, applyDir, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  attachImgFade,
  tFor,
} from './shared.js';

const LANG = 'ar';

const state = {
  names: [],
  visible: [],
  translations: new Map(),
  lang: LANG,
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  favoritesOnly: localStorage.getItem('favoritesOnly') === '1',
};

async function init() {
  bindGlobalEvents();
  let names, trans;
  try {
    [names, trans] = await Promise.all([
      loadJSON('json/names.json'),
      loadJSON('json/name_translations.json'),
    ]);
  } catch (err) {
    console.error(err);
    $('#list').removeAttribute('aria-busy');
    $('#list').innerHTML = `<p class="empty">${escapeHtml(tFor(LANG, 'load_failed'))}</p>`;
    return;
  }

  state.names = names.sort((a, b) => a.display_order - b.display_order);
  for (const t of trans) {
    if (!state.translations.has(t.gods_name_id)) state.translations.set(t.gods_name_id, {});
    state.translations.get(t.gods_name_id)[t.lang] = t;
  }

  applyLangChrome();
  renderTodaysName();
  renderList();
}

/* Random pick on every fresh page load — no timer, no rotation. The
   spotlight is a serendipity surface: refresh the page to discover a
   different name. */
function pickTodaysName(names) {
  if (!names.length) return null;
  return names[Math.floor(Math.random() * names.length)];
}

function renderTodaysName() {
  const el = $('#todays-name');
  if (!el) return;
  const name = pickTodaysName(state.names);
  if (!name) return;
  const t = loc(name);
  const translit = t.name || '';
  const bg = safePath(name.background_image);
  const calligraphy = safeSvgPath(name.image);
  const tint = safeColor(name.color);
  const label = tFor(LANG, 'todays_name');
  const ariaLabel = `${label}: ${name.default_name}${translit ? ', ' + translit : ''}`;
  const cardStyle = tint ? `background-color: ${tint}` : '';
  const calligraphyHtml = calligraphy
    ? `<img class="card-arabic-svg" src="${escapeHtml(calligraphy)}" alt="${escapeHtml(name.default_name)}" loading="eager" decoding="async" fetchpriority="high" data-fallback="${escapeHtml(name.default_name)}">`
    : escapeHtml(name.default_name);

  el.innerHTML = `
    <span id="todays-name-label" class="todays-name-label">${escapeHtml(label)}</span>
    <a class="featured-card" href="name.html?id=${name.id}" aria-label="${escapeHtml(ariaLabel)}" style="${cardStyle}">
      ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high">` : ''}
      <span class="card-arabic">${calligraphyHtml}</span>
      ${translit ? `<span class="featured-card-translit">${escapeHtml(translit)}</span>` : ''}
    </a>
  `;
  el.hidden = false;

  const bgImg = el.querySelector('img.card-bg.is-loading');
  if (bgImg) attachImgFade(bgImg);
  const svgImg = el.querySelector('img.card-arabic-svg');
  if (svgImg) attachCalligraphyFallback(svgImg);
  attachCardTilt(el.querySelector('.featured-card'));
  updateTodaysNameVisibility();
}

/* The daily card is a discovery surface, not a search result. Hide it
   when the user is searching or filtering favourites so the visible
   list doesn't get pushed below the fold. */
function updateTodaysNameVisibility() {
  const el = $('#todays-name');
  if (!el || el.hidden) return;
  const isSearching = !!$('#search').value.trim();
  el.classList.toggle('is-hidden', isSearching || state.favoritesOnly);
}

function applyLangChrome() {
  applyDir();
  $('#search').setAttribute('placeholder', tFor(LANG, 'search'));
  $('#search').setAttribute('aria-label', tFor(LANG, 'search'));
  $('#search-clear').setAttribute('aria-label', tFor(LANG, 'clear_search'));
  refreshFavoritesToggleLabel();
}

function refreshFavoritesToggleLabel() {
  const btn = $('#favorites-toggle');
  const key = state.favoritesOnly ? 'favorites_all' : 'favorites_show';
  btn.setAttribute('aria-label', tFor(LANG, key));
  btn.setAttribute('title', tFor(LANG, key));
  btn.setAttribute('aria-pressed', state.favoritesOnly ? 'true' : 'false');
  btn.classList.toggle('is-active', state.favoritesOnly);
}

function loc(name) {
  return localized(state.translations, name);
}

function getOrdered(filterText = '') {
  let pool = state.names;
  if (state.favoritesOnly) {
    pool = pool.filter((n) => state.favorites.has(n.id));
  }
  const q = filterText.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter((n) => {
    const t = loc(n);
    const haystack = [
      n.default_name,
      t.name,
      shortText(t.short_meaning_val),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function renderList() {
  const list = $('#list');
  state.visible = getOrdered($('#search').value);

  list.removeAttribute('aria-busy');

  if (state.visible.length === 0) {
    const key = state.favoritesOnly && !$('#search').value.trim() ? 'favorites_empty' : 'no_results';
    list.innerHTML = `<p class="empty">${escapeHtml(tFor(LANG, key))}</p>`;
    return;
  }

  list.innerHTML = state.visible.map((n, i) => cardMarkup(n, i)).join('');

  for (const img of list.querySelectorAll('img.card-bg.is-loading')) {
    attachImgFade(img);
  }
  for (const img of list.querySelectorAll('img.card-arabic-svg')) {
    attachCalligraphyFallback(img);
  }
  for (const card of list.querySelectorAll('.name-card')) {
    attachCardTilt(card);
  }
}

/* Subtle 3D tilt on hover. Two gates: skip on touchscreens (where
   pointermove only fires during drag, and tap means "navigate") and
   on reduced-motion. The CSS rule that consumes --tilt-x / --tilt-y
   has the same gates so the effect stays consistent if the JS runs
   before media-query state stabilises. */
const SUPPORTS_TILT = window.matchMedia('(hover: hover)').matches
                   && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function attachCardTilt(card) {
  if (!card || !SUPPORTS_TILT) return;
  let raf = 0;
  card.addEventListener('pointerenter', () => card.classList.add('is-tilting'));
  card.addEventListener('pointermove', (e) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
      card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
    });
  });
  const reset = () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    card.classList.remove('is-tilting');
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
  };
  card.addEventListener('pointerleave', reset);
  card.addEventListener('pointercancel', reset);
}

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
        ${translit ? `<span class="card-pill">${escapeHtml(translit)}</span>` : ''}
      </a>
    </article>
  `;
}

function bindGlobalEvents() {
  let searchTimer;
  const search = $('#search');
  const clearBtn = $('#search-clear');
  const updateClearVisible = () => {
    clearBtn.hidden = !search.value;
  };
  search.addEventListener('input', () => {
    updateClearVisible();
    updateTodaysNameVisibility();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 120);
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    updateClearVisible();
    updateTodaysNameVisibility();
    search.focus();
    renderList();
  });
  updateClearVisible();

  $('#favorites-toggle').addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    localStorage.setItem('favoritesOnly', state.favoritesOnly ? '1' : '0');
    refreshFavoritesToggleLabel();
    updateTodaysNameVisibility();
    renderList();
  });
}

init().catch((err) => {
  console.error(err);
  $('#list').removeAttribute('aria-busy');
  $('#list').innerHTML = `<p class="empty">${escapeHtml(tFor(LANG, 'load_failed'))}</p>`;
});
