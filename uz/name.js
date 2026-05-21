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
  `;
  const toolbar = $('#hero-toolbar');
  if (toolbar) {
    toolbar.innerHTML = `
      <button class="card-icon-btn card-play${playing ? ' is-playing' : ''}${loading ? ' is-loading' : ''}" data-action="play" aria-label="${escapeHtml(playLabel)}" type="button">
        ${playIcon}
      </button>
      <span class="card-translit">${escapeHtml(translit)}</span>
      <button class="card-icon-btn card-fav${isFav ? ' is-fav' : ''}" data-action="fav" aria-label="${escapeHtml(favLabel)}" aria-pressed="${isFav ? 'true' : 'false'}" type="button">
        ${iconHeart()}
      </button>
    `;
    toolbar.hidden = false;
  }
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
  const btn = $('.card-play', $('#hero-toolbar'));
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
  const btn = $('.card-fav', $('#hero-toolbar'));
  if (btn) {
    btn.classList.toggle('is-fav', isFav);
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.setAttribute('aria-label', ui(isFav ? 'unfavorite' : 'favorite'));
  }
}

function bindEvents() {
  bindTextSizeControls();
  /* Share button still lives inside the hero card; play / favourite
     now live in the sibling `.hero-toolbar` below it. One handler per
     element keeps the action set local to where the buttons render. */
  $('#hero').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'share') shareCurrent();
  });
  $('#hero-toolbar').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault();
    if (action.dataset.action === 'play') audioCtrl.toggle(state.currentId);
    if (action.dataset.action === 'fav') toggleFav(state.currentId);
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

/* Share the current name. The preferred path composes a portrait
   1080×1350 PNG card on a canvas (bg photo + scrim + white calligraphy
   silhouette + transliteration + short meaning) and shares it as a
   file via `navigator.share({ files })`. When that's not available —
   desktop browsers without the share API, iOS < 15, or when the
   composer fails — fall back to text/URL share, then to plain
   clipboard copy. The share button gets `is-loading` while the
   image is composing so the user sees something is happening. */
async function shareCurrent() {
  const name = state.names.find((n) => n.id === state.currentId);
  if (!name) return;
  const t = loc(name);
  const title = `${name.default_name}${t.name ? ' — ' + t.name : ''}`;
  const summary = shortText(t.short_meaning_val);
  const url = location.href;

  const btn = $('.hero-share');
  if (btn) btn.classList.add('is-loading');

  let file = null;
  try {
    file = await composeShareCard(name, t, summary, url);
  } catch (err) {
    console.warn('share card compose failed:', err);
  } finally {
    if (btn) btn.classList.remove('is-loading');
  }

  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      /* The URL is baked into the image itself (footer line), so
         leave both the `url` field and any URL inside `text` out of
         the share payload. Otherwise Telegram and friends will fall
         back to the link preview and drop the image. */
      await navigator.share({ files: [file], title, text: summary || title });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      /* fall through */
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text: summary || title, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  copyToClipboard(url);
}

/* Compose a portrait share card on a 1080×1350 canvas:
     • bg photo (cover-fit)
     • bottom-weighted dark scrim so the text stays legible on any photo
     • calligraphy SVG drawn through a tmp canvas + `source-in` white
       fill so it ends up as a clean white silhouette regardless of the
       SVG's source colour (mirrors the on-page `brightness(0) invert(1)`
       filter)
     • transliterated name (large bold)
     • short meaning (multi-line, wrapped, RTL on the Arabic edition).
   Returns a `File` ready for `navigator.share`. */
async function composeShareCard(name, t, summary, url) {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  /* Background photo, cover-fit. Fallback solid colour matches `--bg`
     so a missing image still produces a readable card. */
  const bgPath = safePath(name.background_image);
  if (bgPath) {
    try {
      const bg = await loadImage(bgPath);
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = bg.width * scale, dh = bg.height * scale;
      ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } catch (_) {
      ctx.fillStyle = '#0a0a0d';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#0a0a0d';
    ctx.fillRect(0, 0, W, H);
  }

  /* Bottom-weighted scrim so the text on the lower half stays legible
     and the calligraphy in the upper half keeps the photo's mood. */
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.20)');
  grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.50)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  /* Calligraphy: draw the SVG into a tmp canvas, then re-fill with
     white using `source-in` so opaque regions become a clean white
     silhouette. */
  const svgPath = safeSvgPath(name.image);
  if (svgPath) {
    try {
      const svg = await loadImage(svgPath);
      const sw = svg.naturalWidth || 1000;
      const sh = svg.naturalHeight || 400;
      const tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      const tctx = tmp.getContext('2d');
      tctx.drawImage(svg, 0, 0, sw, sh);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, sw, sh);

      const maxW = W * 0.66, maxH = H * 0.28;
      const aspect = sw / sh;
      let dw = maxW, dh = dw / aspect;
      if (dh > maxH) { dh = maxH; dw = dh * aspect; }
      const dx = (W - dw) / 2;
      const dy = H * 0.16;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(tmp, dx, dy, dw, dh);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    } catch (_) { /* fall through — skip the calligraphy */ }
  }

  /* Transliteration. RTL edition reads its own way naturally; canvas
     `direction` lets the shaper match the page. */
  const isRTL = LANG === 'ar';
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  const translit = t.name || name.default_name;
  if (translit) {
    ctx.font = `700 64px ${isRTL ? '"Cairo", "Amiri"' : 'system-ui'}, sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 16;
    ctx.fillText(translit, W / 2, H * 0.62);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  /* Short meaning, wrapped. Five-line cap protects the layout from
     unusually long entries. */
  if (summary) {
    ctx.fillStyle = '#e6e6ea';
    ctx.font = `400 38px ${isRTL ? '"Amiri", serif' : 'system-ui, sans-serif'}`;
    const lines = wrapCanvasText(ctx, summary, W * 0.82);
    const max = 5;
    const lineHeight = 54;
    const drawn = lines.slice(0, max);
    const startY = H * 0.70;
    drawn.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineHeight));
  }

  /* URL footer baked into the image — strips the protocol so the
     line reads cleaner. Recipients copy it from the rendered card
     itself (caption now stays text-only). */
  if (url) {
    ctx.direction = 'ltr';
    const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '400 26px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(displayUrl, W / 2, H - 50);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob null')), 'image/png');
  });
  const filename = `${(t.name || name.default_name).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').trim() || 'name'}.png`;
  return new File([blob], filename, { type: 'image/png' });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
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
