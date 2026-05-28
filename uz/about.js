import {
  $, $$,
  loadJSON, applyDir,
  escapeHtml, safePath, safeColor,
  attachImgFade,
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
  const share = $('#bar-share');
  if (share) share.hidden = true;
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
  const share = $('#bar-share');
  if (share) share.hidden = false;

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
  const share = $('#bar-share');
  if (share) share.addEventListener('click', onShareClick);
}

function onShareClick() {
  const article = state.articles.find((a) => a.id === state.currentId);
  if (article) shareArticle(article);
}

/* ── Article → Instagram-carousel image set ──────────────────────────
   Composes the article as a sequence of 1080×1350 PNGs: a cover page
   (background photo + title) followed by as many text pages as the
   body needs, then shares them all via `navigator.share({ files })`.
   Instagram (and other targets) accept the multi-file payload and
   build a carousel. Falls back to copying the URL when share or
   multi-file share isn't available. */
const CARD_W = 1080;
const CARD_H = 1350;
const MAX_CARDS = 10; // Instagram carousel ceiling

async function shareArticle(article) {
  const btn = $('#bar-share');
  if (btn) btn.classList.add('is-loading');
  let files = [];
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    files = await composeArticleCards(article);
  } catch (err) {
    console.warn('article share compose failed:', err);
  } finally {
    if (btn) btn.classList.remove('is-loading');
  }

  if (files.length && navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  copyToClipboard(location.href);
}

async function composeArticleCards(article) {
  const blocks = parseBlocks(article.body_val);
  const measure = document.createElement('canvas').getContext('2d');
  const pages = layoutPages(blocks, measure);
  const total = pages.length + 1; // + cover
  const slug = (article.title_val || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'maqola';

  const files = [];
  files.push(await renderCover(article, 1, total, `${slug}-1.png`));
  for (let i = 0; i < pages.length && files.length < MAX_CARDS; i++) {
    files.push(await renderTextPage(pages[i], i + 2, total, `${slug}-${i + 2}.png`));
  }
  return files;
}

/* Flatten the sanitised body HTML into typed text blocks. */
function parseBlocks(html) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = String(html || '');
  const blocks = [];
  const push = (type, text) => { text = (text || '').replace(/\s+/g, ' ').trim(); if (text) blocks.push({ type, text }); };
  for (const node of tmpl.content.childNodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) { push('para', node.textContent); continue; }
    const tag = node.tagName;
    if (tag === 'UL' || tag === 'OL') {
      for (const li of node.querySelectorAll('li')) push('bullet', li.textContent);
    } else if (/^H[3-5]$/.test(tag)) {
      push('heading', node.textContent);
    } else if (tag === 'BLOCKQUOTE') {
      push('quote', node.textContent);
    } else {
      push('para', node.textContent);
    }
  }
  return blocks;
}

const PAD_X = 96;
const TOP_Y = 170;
const BOTTOM_Y = CARD_H - 150;
const BLOCK_GAP = 30;

function blockFont(type) {
  /* Match the on-page body font per edition: the ar `.section-body`
     uses Amiri (serif), the uz one uses the system UI sans-serif
     (`--font-ui`). Headings stay Cairo to mirror the title font. */
  const bodyFamily = LANG === 'ar'
    ? '"Amiri", serif'
    : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  if (type === 'heading') return { font: '700 46px "Cairo", sans-serif', lh: 62, indent: 0, color: '#d6ad5a' };
  if (type === 'bullet')  return { font: `400 38px ${bodyFamily}`, lh: 56, indent: 46, color: '#e6e6ea' };
  if (type === 'quote')   return { font: `italic 400 38px ${bodyFamily}`, lh: 56, indent: 36, color: '#f4f4f7' };
  return { font: `400 38px ${bodyFamily}`, lh: 56, indent: 0, color: '#e6e6ea' };
}

/* Wrap each block to the content width, then pack the wrapped lines
   into pages that fit between TOP_Y and BOTTOM_Y. */
function layoutPages(blocks, ctx) {
  const contentW = CARD_W - PAD_X * 2;
  const availH = BOTTOM_Y - TOP_Y;
  const items = [];
  for (const b of blocks) {
    const f = blockFont(b.type);
    ctx.font = f.font;
    const lines = wrapText(ctx, b.text, contentW - f.indent);
    items.push({ ...b, ...f, lines });
  }
  const pages = [];
  let cur = [], curH = 0;
  for (const item of items) {
    const itemH = item.lines.length * item.lh;
    if (curH + itemH > availH && cur.length) { pages.push(cur); cur = []; curH = 0; }
    cur.push(item);
    curH += itemH + BLOCK_GAP;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/* Dark mesh backdrop shared by cover + text pages. */
function paintBackdrop(ctx) {
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const pools = [
    [CARD_W * 0.12, -CARD_H * 0.05, 'rgba(214,173,90,0.10)'],
    [CARD_W * 1.0, CARD_H * 0.3, 'rgba(110,92,200,0.08)'],
    [CARD_W * 0.5, CARD_H * 1.05, 'rgba(214,173,90,0.06)'],
  ];
  for (const [x, y, color] of pools) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, CARD_W * 0.9);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }
}

function paintFooter(ctx, pageNum, total) {
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '400 24px system-ui, sans-serif';
  ctx.fillText(location.host + location.pathname.replace(/[^/]*$/, '').replace(/\/$/, ''), CARD_W / 2, CARD_H - 70);
  // page dots
  ctx.fillStyle = 'rgba(214,173,90,0.9)';
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillText(`${pageNum} / ${total}`, CARD_W / 2, CARD_H - 108);
}

async function renderCover(article, pageNum, total, filename) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const bg = safePath(article.image);
  if (bg) {
    try {
      const img = await loadImage(bg);
      const scale = Math.max(CARD_W / img.width, CARD_H / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh);
    } catch (_) { paintBackdrop(ctx); }
  } else { paintBackdrop(ctx); }

  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const isRTL = LANG === 'ar';
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 60px ${isRTL ? '"Cairo"' : '"Cairo"'}, sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 20;
  const titleLines = wrapText(ctx, (article.title_val || '').replace(/\s+/g, ' ').trim(), CARD_W - PAD_X * 2);
  const lh = 78;
  const startY = CARD_H / 2 - ((titleLines.length - 1) * lh) / 2;
  titleLines.slice(0, 6).forEach((line, i) => ctx.fillText(line, CARD_W / 2, startY + i * lh));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  paintFooter(ctx, pageNum, total);
  return canvasToFile(canvas, filename);
}

async function renderTextPage(items, pageNum, total, filename) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  paintBackdrop(ctx);

  const isRTL = LANG === 'ar';
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = isRTL ? 'right' : 'left';
  const xStart = isRTL ? CARD_W - PAD_X : PAD_X;

  let y = TOP_Y;
  for (const item of items) {
    ctx.font = item.font;
    ctx.fillStyle = item.color;
    const indentX = isRTL ? xStart - item.indent : xStart + item.indent;
    for (let i = 0; i < item.lines.length; i++) {
      const baseline = y + item.lh * (i + 0.8);
      if (item.type === 'bullet' && i === 0) {
        // bullet dot at the margin
        ctx.save();
        ctx.fillStyle = '#d6ad5a';
        const bx = isRTL ? xStart : xStart;
        ctx.beginPath();
        ctx.arc(bx + (isRTL ? -8 : 8), baseline - 12, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillText(item.lines[i], indentX, baseline);
    }
    if (item.type === 'quote') {
      // accent bar on the leading edge
      ctx.save();
      ctx.fillStyle = '#d6ad5a';
      const barX = isRTL ? CARD_W - PAD_X + 14 : PAD_X - 20;
      ctx.fillRect(barX, y + 6, 5, item.lines.length * item.lh - 12);
      ctx.restore();
    }
    y += item.lines.length * item.lh + BLOCK_GAP;
  }

  paintFooter(ctx, pageNum, total);
  return canvasToFile(canvas, filename);
}

function canvasToFile(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(new File([b], filename, { type: 'image/png' })) : reject(new Error('toBlob null')), 'image/png');
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function copyToClipboard(text) {
  if (!text) return;
  const msg = ui('copied');
  try { await navigator.clipboard.writeText(text); showToast(msg); return; } catch (_) {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast(msg); } catch (_) {}
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
