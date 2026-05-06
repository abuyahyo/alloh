const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const state = {
  names: [],
  translations: new Map(),
  languages: [],
  visible: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
  theme: localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  currentId: null,
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

async function init() {
  applyTheme();
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
  renderList();
  $('#count').textContent = `${state.names.length} of 100 names`;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
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

function formatNum(n) {
  const s = String(n);
  return RTL_LANGS.has(state.lang) ? s.replace(/\d/g, (d) => ARABIC_DIGITS[+d]) : s;
}

function localized(name) {
  const tr = state.translations.get(name.id) || {};
  return tr[state.lang] || tr[DEFAULT_LANG] || {};
}

function shortText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

function renderList(filter = '') {
  const list = $('#list');
  const q = filter.trim().toLowerCase();

  state.visible = state.names.filter((n) => {
    if (!q) return true;
    const t = localized(n);
    const hay = `${n.default_name} ${t.name || ''}`.toLowerCase();
    return hay.includes(q);
  });

  list.removeAttribute('aria-busy');

  if (state.visible.length === 0) {
    list.innerHTML = '<li class="empty">No names match your search.</li>';
    return;
  }

  const html = state.visible.map((n, i) => {
    const t = localized(n);
    const teaser = shortText(t.short_meaning_val).slice(0, 120);
    const delay = Math.min(i * 14, 480);
    return `
      <li class="row row-fadein" data-id="${n.id}" tabindex="0" role="button" style="animation-delay: ${delay}ms">
        <div class="row-num">${escapeHtml(formatNum(n.display_order))}</div>
        <div class="row-main">
          <div class="row-arabic">${escapeHtml(n.default_name)}</div>
          <div class="row-translit">${escapeHtml(t.name || '')}</div>
        </div>
        <div class="row-meaning">${escapeHtml(teaser)}</div>
        <div class="row-arrow" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 4l6 6-6 6"/>
          </svg>
        </div>
      </li>
    `;
  }).join('');

  list.innerHTML = html;
}

/* ----------------------------------------------------------------
   Detail panel
   ---------------------------------------------------------------- */

async function openPanel(id) {
  const idx = state.names.findIndex((n) => n.id === id);
  if (idx === -1) return;
  const name = state.names[idx];
  state.currentId = id;

  const t = localized(name);
  const panel = $('#panel');
  const overlay = $('#overlay');

  panel.style.setProperty('--accent', safeColor(name.color));

  const bg = $('.panel-bg', panel);
  if (name.background_image && /^[\w./-]+$/.test(name.background_image)) {
    bg.style.backgroundImage = `url("${name.background_image}")`;
  } else {
    bg.style.backgroundImage = '';
  }

  $('.panel-num', panel).textContent = `Name ${formatNum(name.display_order)} of ${formatNum(state.names.length)}`;
  $('.panel-arabic', panel).textContent = name.default_name;
  $('.panel-translit', panel).textContent = t.name || '';

  const audio = $('.panel-audio', panel);
  audio.pause();
  audio.hidden = true;
  audio.removeAttribute('src');
  if (name.voice) {
    audio.addEventListener('error', () => { audio.hidden = true; }, { once: true });
    audio.addEventListener('loadedmetadata', () => { audio.hidden = false; }, { once: true });
    audio.src = name.voice;
    audio.load();
  }

  const svgBox = $('.panel-svg', panel);
  svgBox.replaceChildren();
  if (name.image) {
    try {
      const r = await fetch(name.image);
      if (state.currentId !== id) return;
      if (r.ok) {
        const txt = await r.text();
        if (state.currentId !== id) return;
        if (txt.trim().startsWith('<svg') || txt.trim().startsWith('<?xml')) {
          const safe = sanitizeSVG(txt);
          if (safe) svgBox.replaceChildren(safe);
        } else {
          const img = document.createElement('img');
          img.src = name.image;
          img.alt = '';
          svgBox.replaceChildren(img);
        }
      }
    } catch { /* ignore */ }
  }

  $('.panel-short-key', panel).textContent = t.short_meaning_key || '';
  setSanitizedHTML($('.panel-short-val', panel), t.short_meaning_val);
  $('.panel-meaning-key', panel).textContent = t.meanings_key || '';
  setSanitizedHTML($('.panel-meaning-val', panel), t.meanings_val);

  const prev = state.names[idx - 1];
  const next = state.names[idx + 1];
  const prevBtn = $('.nav-prev', panel);
  const nextBtn = $('.nav-next', panel);
  prevBtn.disabled = !prev;
  nextBtn.disabled = !next;
  $('.nav-name', prevBtn).textContent = prev ? prev.default_name : '—';
  $('.nav-name', nextBtn).textContent = next ? next.default_name : '—';
  prevBtn.dataset.id = prev ? prev.id : '';
  nextBtn.dataset.id = next ? next.id : '';

  $('.panel-inner', panel).scrollTop = 0;

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  const panel = $('#panel');
  const overlay = $('#overlay');
  const audio = $('.panel-audio', panel);
  audio.pause();
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('show');
  setTimeout(() => { overlay.hidden = true; }, 300);
  document.body.style.overflow = '';
  state.currentId = null;
}

/* ----------------------------------------------------------------
   Events
   ---------------------------------------------------------------- */

function bindGlobalEvents() {
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir();
    renderList($('#search').value);
    if (state.currentId !== null) openPanel(state.currentId);
  });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => renderList(value), 120);
  });

  $('#theme').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    applyTheme();
  });

  const list = $('#list');
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (row && !row.classList.contains('skeleton') && !row.classList.contains('empty')) {
      openPanel(Number(row.dataset.id));
    }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('.row');
    if (!row || !row.dataset.id) return;
    e.preventDefault();
    openPanel(Number(row.dataset.id));
  });

  const panel = $('#panel');
  $('.panel-close', panel).addEventListener('click', closePanel);
  $('#overlay').addEventListener('click', closePanel);

  $('.nav-prev', panel).addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.id);
    if (id) openPanel(id);
  });
  $('.nav-next', panel).addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.id);
    if (id) openPanel(id);
  });

  document.addEventListener('keydown', (e) => {
    if (panel.getAttribute('aria-hidden') === 'true') return;
    if (e.key === 'Escape') closePanel();
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const goNext = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const btn = goNext ? $('.nav-next', panel) : $('.nav-prev', panel);
      if (!btn.disabled && btn.dataset.id) openPanel(Number(btn.dataset.id));
    }
  });
}

/* ----------------------------------------------------------------
   Sanitization & helpers
   ---------------------------------------------------------------- */

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

function sanitizeSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') return null;
  cleanSVGNode(svg);
  return svg;
}

function cleanSVGNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'foreignobject') {
    node.remove();
    return;
  }
  for (const attr of [...node.attributes]) {
    const n = attr.name.toLowerCase();
    const v = attr.value || '';
    if (n.startsWith('on')) node.removeAttribute(attr.name);
    else if ((n === 'href' || n === 'xlink:href') && /^\s*javascript:/i.test(v)) {
      node.removeAttribute(attr.name);
    }
  }
  for (const child of [...node.childNodes]) cleanSVGNode(child);
}

function safeColor(c) {
  if (typeof c !== 'string') return 'var(--accent)';
  return /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : 'var(--accent)';
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
  $('#list').innerHTML = `<li class="empty">${escapeHtml(err.message)}</li>`;
  console.error(err);
});
