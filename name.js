import {
  $, $$,
  loadJSON, applyDir, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconLoading, iconHeart, iconDownload,
  createAudioController, attachImgFade,
  tFor,
} from './shared.js';

const LANG = 'ar';

const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const ALLOWED_ATTRS_BY_TAG = {
  SPAN: new Set(['class', 'dir']),
};

const SECTIONS = [
  { act: 'meanings', valKey: 'meanings_val', keyKey: 'meanings_key' },
  { act: 'evidence', valKey: 'evidence_val', keyKey: 'evidence_key' },
];

function ui(key) {
  return tFor(LANG, key);
}

const state = {
  names: [],
  translations: new Map(),
  lang: LANG,
  favorites: new Set(JSON.parse(localStorage.getItem('favorites') || '[]')),
  currentId: null,
  cards: new Map(),
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
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

  let names, trans, cards;
  try {
    [names, trans, cards] = await Promise.all([
      loadJSON('json/names.json'),
      loadJSON('json/name_translations.json'),
      loadJSON('json/cards.json').catch((e) => { console.warn('cards.json:', e); return []; }),
    ]);
  } catch (err) {
    console.error(err);
    $('#hero').removeAttribute('aria-busy');
    $('#hero').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
    return;
  }

  state.names = names.sort((a, b) => a.display_order - b.display_order);

  for (const t of trans) {
    if (!state.translations.has(t.gods_name_id)) state.translations.set(t.gods_name_id, {});
    state.translations.get(t.gods_name_id)[t.lang] = t;
  }
  for (const c of cards) {
    if (!state.cards.has(c.gods_name_id)) state.cards.set(c.gods_name_id, []);
    state.cards.get(c.gods_name_id).push(c);
  }

  applyLangChrome();
  render();
}

function applyLangChrome() {
  applyDir();
  $$('.nav-home').forEach((home) => home.setAttribute('aria-label', ui('home')));
}

function loc(name) {
  return localized(state.translations, name);
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
    const span = el.querySelector(':scope > span');
    if (span && el.children.length === 1) {
      span.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

function renderSections(name) {
  const t = loc(name);
  const sectionsEl = $('#sections');
  sectionsEl.replaceChildren();

  for (const s of SECTIONS) {
    const html = t[s.valKey];
    if (!hasContent(html)) continue;

    const section = document.createElement('section');
    section.className = 'section';
    section.id = `sec-${s.act}`;
    section.setAttribute('data-act', s.act);

    const head = document.createElement('div');
    head.className = 'section-head';
    const h3 = document.createElement('h3');
    h3.textContent = ui(s.act);
    head.appendChild(h3);
    section.appendChild(head);

    const body = document.createElement('div');
    body.className = 'section-body';
    setSanitizedHTML(body, html);
    section.appendChild(body);

    sectionsEl.appendChild(section);
  }
}

function hasContent(html) {
  if (!html) return false;
  return shortText(html).length > 5;
}

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
    img.addEventListener('error', () => fig.remove(), { once: true });
    fig.appendChild(img);

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
  const native = items.filter((i) => i.lang === LANG);
  if (native.length) return native;
  return items;
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
  uz: { prev: 'Олдинги', next: 'Кейинги' },
};

function renderPageNav(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const set = NAV_LABEL[LANG] || NAV_LABEL.ar;
  const rtl = document.documentElement.dir === 'rtl';
  $$('.nav-prev').forEach((el) => fillBarNavLink(el, prev, set.prev, rtl ? 'ArrowRight' : 'ArrowLeft'));
  $$('.nav-next').forEach((el) => fillBarNavLink(el, next, set.next, rtl ? 'ArrowLeft' : 'ArrowRight'));

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
      const allowedAttrs = ALLOWED_ATTRS_BY_TAG[child.tagName];
      for (const attr of [...child.attributes]) {
        if (!allowedAttrs || !allowedAttrs.has(attr.name)) {
          child.removeAttribute(attr.name);
        }
      }
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
