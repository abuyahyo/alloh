const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
const DEFAULT_LANG = 'ar';

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
  state.languages = langs;

  const transLangs = new Set(trans.map((t) => t.lang));
  state.languages = state.languages.filter((l) => transLangs.has(l.code));

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

  document.getElementById('search').addEventListener('input', (e) => {
    renderGrid(e.target.value);
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
  if (name.voice) {
    audio.src = name.voice;
    audio.hidden = false;
    audio.onerror = () => { audio.hidden = true; };
  } else {
    audio.removeAttribute('src');
    audio.hidden = true;
  }

  const svgBox = detail.querySelector('.detail-svg');
  svgBox.innerHTML = '';
  if (name.image) {
    try {
      const r = await fetch(name.image);
      if (r.ok) {
        const txt = await r.text();
        if (txt.trim().startsWith('<svg')) {
          svgBox.innerHTML = txt;
        } else {
          svgBox.innerHTML = `<img src="${name.image}" alt="">`;
        }
      }
    } catch {
      // ignore
    }
  }

  detail.querySelector('.detail-short-key').textContent = t.short_meaning_key || '';
  detail.querySelector('.detail-short-val').innerHTML = t.short_meaning_val || '';
  detail.querySelector('.detail-meaning-key').textContent = t.meanings_key || '';
  detail.querySelector('.detail-meaning-val').innerHTML = t.meanings_val || '';

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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init().catch((err) => {
  document.getElementById('grid').innerHTML = `<p style="color:#f88;text-align:center;grid-column:1/-1;padding:2rem;">${escapeHtml(err.message)}</p>`;
  console.error(err);
});
