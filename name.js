import {
  DEFAULT_LANG,
  $, $$,
  loadJSON, applyDir, buildLangSelect, localized,
  escapeHtml, shortText, safePath, safeColor,
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

  hero.removeAttribute('aria-busy');
  hero.innerHTML = `
    ${bg ? `<img class="card-bg is-loading" src="${escapeHtml(bg)}" alt="" loading="eager" decoding="async" fetchpriority="high">` : ''}
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
  attachImgFade(hero.querySelector('img.card-bg.is-loading'));

  setSanitizedHTML($('#meaning'), t.short_meaning_val);
  renderUiStrings();
  renderSectionsAndTOC(name);
  renderPrevNext(name);
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

function renderPrevNext(name) {
  const idx = state.names.findIndex((n) => n.id === name.id);
  setNavLink($('#prev'), state.names[idx - 1], 'prev');
  setNavLink($('#next'), state.names[idx + 1], 'next');
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
  const t = loc(name);
  const arrow = (dir === 'prev') === (document.documentElement.dir === 'rtl') ? '←' : '→';
  el.innerHTML = `<span class="nav-arrow" aria-hidden="true">${arrow}</span><span class="nav-text">${escapeHtml(name.default_name)}${t.name ? `<small>${escapeHtml(t.name)}</small>` : ''}</span>`;
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
