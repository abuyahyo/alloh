import {
  $, $$,
  loadJSON, applyDir,
  escapeHtml, safePath, safeColor,
  attachImgFade,
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

const state = {
  articles: [],
  currentId: null,
};

function ui(key) { return tFor(LANG, key); }

async function init() {
  applyTextSize(loadTextSize());
  bindEvents();

  let articles;
  try {
    articles = await loadJSON('json/about.json');
  } catch (err) {
    console.error(err);
    $('#list-view').removeAttribute('aria-busy');
    $('#list-view').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
    return;
  }
  state.articles = articles
    .filter((a) => a && a.title_val)
    .sort((a, b) => a.display_order - b.display_order);

  applyDir();
  document.title = `${ui('about_title')} | ${ui('pwa_title')}`;

  const idParam = new URLSearchParams(location.search).get('id');
  if (idParam) {
    const id = Number(idParam);
    if (Number.isFinite(id) && id > 0 && state.articles.some((a) => a.id === id)) {
      state.currentId = id;
      renderDetail(id);
      renderTextSizeControls();
      return;
    }
    history.replaceState(null, '', 'about.html');
  }
  renderList();
}

function renderList() {
  $('#detail-view').hidden = true;
  $('#bar-back').hidden = true;
  $('#list-view').hidden = false;
  $('#list-view').removeAttribute('aria-busy');

  if (state.articles.length === 0) {
    $('#list-view').innerHTML = `<p class="empty">${escapeHtml(ui('no_results'))}</p>`;
    return;
  }

  $('#list-view').innerHTML = state.articles.map(cardMarkup).join('');
  for (const img of $('#list-view').querySelectorAll('img.about-card-bg.is-loading')) {
    attachImgFade(img);
  }
}

function cardMarkup(a) {
  const img = safePath(a.image);
  const tint = safeColor(a.color);
  const style = tint ? ` style="background-color: ${tint}"` : '';
  const ariaLabel = escapeHtml(a.title_val);
  return `
    <a class="about-card" href="about.html?id=${a.id}" aria-label="${ariaLabel}"${style}>
      ${img ? `<img class="about-card-bg is-loading" src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">` : ''}
      <span class="about-card-title">${escapeHtml(a.title_val)}</span>
    </a>
  `;
}

function renderDetail(id) {
  const article = state.articles.find((a) => a.id === id);
  if (!article) {
    location.replace('about.html');
    return;
  }
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  $('#bar-back').hidden = false;

  $('#about-title').textContent = article.title_val || '';
  document.title = `${article.title_val || ''} | ${ui('pwa_title')}`;
  setSanitizedHTML($('#about-body'), article.body_val);
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

function bindEvents() {
  bindTextSizeControls();
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
  $('#list-view').removeAttribute('aria-busy');
  $('#list-view').innerHTML = `<p class="empty">${escapeHtml(ui('load_failed'))}</p>`;
});
