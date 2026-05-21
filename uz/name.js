import {
  $, $$,
  loadJSON, applyDir, localized,
  escapeHtml, shortText, safePath, safeSvgPath, safeColor,
  iconPlay, iconPause, iconLoading, iconHeart, iconShare,
  createAudioController, attachImgFade,
  showToast,
  tFor,
} from './shared.js';

const LANG = 'uz';

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
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
  onChange: refreshPlayingUI,
});


async function init() {
  applyTextSize(loadTextSize());

  const params = new URLSearchParams(location.search);
  const idParam = params.get('id');
  const id = idParam ? Number(idParam) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    location.replace('index.html');
    return;
  }
  state.currentId = id;

  bindEvents();

  let names, trans;
  try {
    [names, trans] = await Promise.all([
      loadJSON('json/names.json'),
      loadJSON('json/name_translations.json'),
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

  applyLangChrome();
  render();
}

function applyLangChrome() {
  applyDir();
  const home = $('#bar-home');
  if (home) home.setAttribute('aria-label', ui('home'));
  applyTextSize(loadTextSize());
  renderTextSizeControls();
}

const TEXT_SIZES = ['sm', 'md', 'lg'];

function loadTextSize() {
  const v = localStorage.getItem('textSize');
  return TEXT_SIZES.includes(v) ? v : 'md';
}

function applyTextSize(size) {
  if (size === 'md') document.documentElement.removeAttribute('data-text-size');
  else document.documentElement.setAttribute('data-text-size', size);
}

function renderTextSizeControls() {
  const root = $('#text-size-controls');
  if (!root) return;
  root.setAttribute('aria-label', ui('text_size'));
  const current = loadTextSize();
  for (const btn of root.querySelectorAll('.text-size-btn')) {
    const size = btn.dataset.size;
    const label = ui('text_size_' + size);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', size === current ? 'true' : 'false');
  }
}

function bindTextSizeControls() {
  const root = $('#text-size-controls');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.text-size-btn');
    if (!btn) return;
    const size = btn.dataset.size;
    if (!TEXT_SIZES.includes(size)) return;
    const anchorTop = btn.getBoundingClientRect().top;
    localStorage.setItem('textSize', size);
    applyTextSize(size);
    renderTextSizeControls();
    const delta = btn.getBoundingClientRect().top - anchorTop;
    if (delta) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  });
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

  const shareLabel = ui('share');
  hero.removeAttribute('aria-busy');
  hero.innerHTML = `
    ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high">` : ''}
    <button type="button" class="hero-share" data-action="share" aria-label="${escapeHtml(shareLabel)}" title="${escapeHtml(shareLabel)}">
      ${iconShare()}
    </button>
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
    attachApproxToggles(body);
    section.appendChild(body);

    sectionsEl.appendChild(section);
  }
}

function hasContent(html) {
  if (!html) return false;
  return shortText(html).length > 5;
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
  fillBarNavLink($('#bar-prev'), prev, set.prev, rtl ? 'ArrowRight' : 'ArrowLeft');
  fillBarNavLink($('#bar-next'), next, set.next, rtl ? 'ArrowLeft' : 'ArrowRight');
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
  // Uzbek build: prefer the localised transliteration (e.g. "Ал-Бариъ")
  // over the Arabic script so the nav matches the page's script.
  if (nameEl) nameEl.textContent = tr.name || target.default_name;
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
  bindTextSizeControls();
  $('#hero').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'play') audioCtrl.toggle(state.currentId);
    if (action.dataset.action === 'fav') toggleFav(state.currentId);
    if (action.dataset.action === 'share') shareCurrent();
  });

  /* Quranic / hadith excerpts in evidence and scholars' meanings are
     wrapped in `<span class="ar-quote">` by the sanitiser. Tapping one
     copies its plain text so the user can paste a verse into a chat
     without selecting it character-by-character on mobile. */
  $('#sections').addEventListener('click', (e) => {
    const quote = e.target.closest('.ar-quote');
    if (!quote) return;
    copyToClipboard((quote.textContent || '').trim());
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

/* Share the current name via the native share sheet on mobile; on
   desktop browsers without `navigator.share` (or when the user cancels)
   fall back to copying the URL so the action always does *something*
   meaningful. */
async function shareCurrent() {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const t = loc(name);
  const title = `${name.default_name}${t.name ? ' — ' + t.name : ''}`;
  const summary = shortText(t.short_meaning_val);
  const url = location.href;
  const data = { title, text: summary || title, url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      /* fall through to clipboard fallback */
    }
  }
  copyToClipboard(url);
}

async function copyToClipboard(text) {
  if (!text) return;
  const toastMsg = ui('copied');
  try {
    await navigator.clipboard.writeText(text);
    showToast(toastMsg);
    return;
  } catch (_) { /* fall through */ }
  /* Fallback for browsers without the async Clipboard API or when the
     page is served over an insecure origin (clipboard.writeText is
     gated behind https + user-activation). */
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast(toastMsg); } catch (_) {}
  ta.remove();
}

function setSanitizedHTML(el, html) {
  el.replaceChildren();
  if (!html) return;
  const tmpl = document.createElement('template');
  tmpl.innerHTML = String(html);
  cleanNode(tmpl.content);
  el.appendChild(tmpl.content);
}

function attachApproxToggles(root) {
  for (const toggle of root.querySelectorAll('.approx-toggle')) {
    const note = toggle.nextElementSibling;
    if (!note || !note.classList.contains('approx-note')) continue;
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-expanded', 'false');
    const activate = (e) => {
      e.preventDefault();
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      note.classList.toggle('is-open', !open);
    };
    toggle.addEventListener('click', activate);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
  }
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
