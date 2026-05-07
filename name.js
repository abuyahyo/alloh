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
};

const audio = $('#audio');
const audioCtrl = createAudioController({
  audio,
  getName: (id) => state.names.find((n) => n.id === id),
  getLang: () => state.lang,
  onChange: refreshPlayingUI,
});

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
  const t = loc(name);
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

  $$('.more-btn').forEach((btn) => {
    btn.addEventListener('click', () => onMoreAction(btn.dataset.act));
  });

  $('.bar-btn.share').addEventListener('click', shareCurrent);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    const step = (e.key === 'ArrowRight' ? 1 : -1) * dir;
    const idx = state.names.findIndex((n) => n.id === state.currentId);
    const next = state.names[idx + step];
    if (next) location.assign(`name.html?id=${next.id}`);
  });
}

function onMoreAction(act) {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const section = SECTIONS.find((s) => s.act === act);
  if (!section) return;

  const t = loc(name);
  const tAr = (state.translations.get(name.id) || {}).ar || {};

  let html = t[section.valKey];
  let entryKey = t[section.keyKey];
  let usedFallback = false;
  if (!hasContent(html)) {
    html = tAr[section.valKey];
    entryKey = tAr[section.keyKey];
    usedFallback = true;
  }
  if (!hasContent(html)) { showToast(ui('no_content')); return; }

  // Per-name labels are heterogeneous in the source data — e.g. some entries
  // carry "وقفات" under effects_key and "الارتباط" under mercy_key. The button
  // labels are deliberately uniform, but the modal title shows the actual
  // section label for that name (Arabic only — non-Arabic UIs keep the
  // hardcoded label for clarity).
  const useEntryKey = (state.lang === 'ar' || usedFallback) && typeof entryKey === 'string' && entryKey.trim().length > 1;
  const title = useEntryKey ? entryKey : ui(act);

  showLongMeaning(title, html, usedFallback ? ui('ar_only') : '');
}

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
  const close = () => sheet.classList.remove('open');
  sheet.querySelector('.long-backdrop').addEventListener('click', close);
  sheet.querySelector('.long-close').addEventListener('click', close);
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
