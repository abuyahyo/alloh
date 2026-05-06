const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';
const ALLOWED_HTML_TAGS = new Set([
  'P', 'BR', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'U',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'H5', 'HR',
]);

const state = {
  names: [],
  translations: new Map(),
  languages: [],
  lang: localStorage.getItem('lang') || DEFAULT_LANG,
};

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

async function init() {
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
  renderGrid();
  bindEvents();
}

function buildLangSelect() {
  const sel = document.getElementById('lang');
  sel.innerHTML = state.languages
    .map((l) => `<option value="${l.code}">${l.name}</option>`)
    .join('');
  sel.value = state.lang;
}

function applyDir() {
  const dir = RTL_LANGS.has(state.lang) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', state.lang);
}

function renderGrid(filter = '') {
  const grid = document.getElementById('grid');
  const q = filter.trim().toLowerCase();

  const cards = state.names
    .map((n) => {
      const tr = state.translations.get(n.id) || {};
      const localized = tr[state.lang] || tr[DEFAULT_LANG] || {};
      const translit = localized.name || '';
      if (q) {
        const hay = `${n.default_name} ${translit}`.toLowerCase();
        if (!hay.includes(q)) return '';
      }
      return `
        <article class="card" data-id="${n.id}" style="--card-color: ${n.color}">
          <div class="num">${n.display_order}</div>
          <div class="arabic">${escapeHtml(n.default_name)}</div>
          <div class="translit">${escapeHtml(translit)}</div>
        </article>
      `;
    })
    .join('');

  grid.innerHTML = cards || '<p style="text-align:center; color:var(--muted); grid-column: 1/-1; padding: 2rem;">No results</p>';
}

function bindEvents() {
  document.getElementById('lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyDir();
    renderGrid(document.getElementById('search').value);
  });

  let searchTimer;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => renderGrid(value), 120);
  });

  document.getElementById('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openDetail(Number(card.dataset.id));
  });

  const detail = document.getElementById('detail');
  detail.querySelector('.close').addEventListener('click', closeDetail);
  detail.addEventListener('click', (e) => {
    if (e.target === detail) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detail.classList.contains('hidden')) closeDetail();
  });
}

async function openDetail(id) {
  const name = state.names.find((n) => n.id === id);
  if (!name) return;
  const tr = state.translations.get(id) || {};
  const t = tr[state.lang] || tr[DEFAULT_LANG] || {};

  const detail = document.getElementById('detail');
  detail.style.setProperty('--accent', name.color || '#c9a86a');
  detail.querySelector('.detail-bg').style.backgroundImage = name.background_image
    ? `url("${name.background_image}")`
    : '';
  detail.querySelector('.detail-arabic').textContent = name.default_name;
  detail.querySelector('.detail-translit').textContent = t.name || '';

  const audio = detail.querySelector('.detail-audio');
  audio.hidden = true;
  audio.removeAttribute('src');
  if (name.voice) {
    const onError = () => { audio.hidden = true; };
    const onLoaded = () => { audio.hidden = false; };
    audio.addEventListener('error', onError, { once: true });
    audio.addEventListener('loadedmetadata', onLoaded, { once: true });
    audio.src = name.voice;
    audio.load();
  }

  const svgBox = detail.querySelector('.detail-svg');
  svgBox.replaceChildren();
  if (name.image) {
    try {
      const r = await fetch(name.image);
      if (r.ok) {
        const txt = await r.text();
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
    } catch {
      // ignore
    }
  }

  detail.querySelector('.detail-short-key').textContent = t.short_meaning_key || '';
  setSanitizedHTML(detail.querySelector('.detail-short-val'), t.short_meaning_val);
  detail.querySelector('.detail-meaning-key').textContent = t.meanings_key || '';
  setSanitizedHTML(detail.querySelector('.detail-meaning-val'), t.meanings_val);

  detail.classList.remove('hidden');
  detail.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  const detail = document.getElementById('detail');
  const audio = detail.querySelector('.detail-audio');
  audio.pause();
  detail.classList.add('hidden');
  detail.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init().catch((err) => {
  document.getElementById('grid').innerHTML = `<p style="color:#f88;text-align:center;grid-column:1/-1;padding:2rem;">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
