/* Shared helpers for the single-language (uz) build. */

export const DEFAULT_LANG = 'uz';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const UI_STRINGS_DATA = {
    search: 'Қидирув',
    clear_search: 'Қидирувни тозалаш',
    language: 'Тил',
    favorites_show: 'Фақат сараланганларни кўрсатиш',
    favorites_all: 'Барчасини кўрсатиш',
    favorites_empty: 'Сараланганлар ҳозирча йўқ',
    play: 'Тинглаш',
    pause: 'Тўхтатиш',
    loading: 'Юкланмоқда…',
    favorite: 'Сараланганларга қўшиш',
    unfavorite: 'Сараланганлардан олиб ташлаш',
    short_meaning: 'Қисқача маъноси',
    meanings: 'Уламоларнинг сўзлари',
    evidence: 'Далиллар',
    no_content: 'Маълумот йўқ',
    ar_only: 'Бу бўлим фақат араб тилида мавжуд',
    copied: 'Нусхаланди',
    share: 'Улашиш',
    share_failed: 'Улашиб бўлмади',
    library: 'Медиатека',
    home: 'Бош саҳифа',
    no_results: 'Натижа топилмади',
    load_failed: 'Юклаб бўлмади. Илтимос, саҳифани янгиланг.',
    not_found: 'Исм топилмади',
    no_audio: 'Бу исм учун аудио мавжуд эмас',
    download: 'Расмни юклаб олиш',
    pwa_title: 'У — Аллоҳ',
  };

export const UI_STRINGS = { 'uz': UI_STRINGS_DATA };

export function tFor(_lang, key) {
  return UI_STRINGS_DATA[key] || '';
}

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

export function applyDir() {
  document.documentElement.setAttribute('dir', 'ltr');
  document.documentElement.setAttribute('lang', 'uz');
  const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (meta) meta.setAttribute('content', UI_STRINGS_DATA.pwa_title || '');
}

export function localized(translations, name) {
  const tr = translations.get(name.id) || {};
  return tr['uz'] || {};
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function shortText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

export function safePath(p) {
  if (typeof p !== 'string' || !p) return '';
  return /^images\/[\w-]+\.(jpe?g|png|webp)$/i.test(p) ? p : '';
}
export function safeSvgPath(p) {
  if (typeof p !== 'string' || !p) return '';
  return /^images\/[\w-]+\.svg$/i.test(p) ? p : '';
}
export function safeVoicePath(p) {
  if (typeof p !== 'string' || !p) return '';
  return /^voices\/[\w-]+\.mp3$/i.test(p) ? p : '';
}
export function safeColor(c) {
  if (typeof c !== 'string') return '';
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : '';
}

export function iconPlay() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>`;
}
export function iconPause() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
}
export function iconLoading() {
  return `<svg class="spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>`;
}
export function iconHeart() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-linejoin="round"/></svg>`;
}
export function iconClose() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
}
export function iconDownload() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M6 11l6 6 6-6M5 20h14"/></svg>`;
}

export function showToast(msg, timeout = 2400) {
  const toast = $('#toast');
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = msg;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, timeout);
}

export function createAudioController({ audio, getName, onChange }) {
  const missing = new Set();
  let playingId = null;
  let loadingId = null;

  const fireMissing = (id) => {
    missing.add(id);
    if (playingId === id) playingId = null;
    if (loadingId === id) loadingId = null;
    onChange();
    showToast(UI_STRINGS_DATA.no_audio || '');
  };

  audio.addEventListener('playing', () => {
    if (loadingId != null) { loadingId = null; onChange(); }
  });
  audio.addEventListener('ended', () => { playingId = null; loadingId = null; onChange(); });
  audio.addEventListener('error', () => {
    if (playingId != null) fireMissing(playingId);
    else if (loadingId != null) fireMissing(loadingId);
  });

  async function toggle(id) {
    const name = getName(id);
    const safeVoice = name ? safeVoicePath(name.voice) : '';
    if (!safeVoice || missing.has(id)) {
      showToast(UI_STRINGS_DATA.no_audio || '');
      onChange();
      return;
    }
    if (playingId === id && !audio.paused) {
      audio.pause();
      playingId = null;
      loadingId = null;
      onChange();
      return;
    }
    audio.pause();
    audio.src = safeVoice;
    playingId = id;
    loadingId = id;
    onChange();
    try {
      await audio.play();
      if (loadingId === id && !audio.paused) {
        loadingId = null;
        onChange();
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      fireMissing(id);
    }
  }

  return {
    toggle,
    isPlaying: (id) => playingId === id,
    isLoading: (id) => loadingId === id,
    get playingId() { return playingId; },
  };
}

export function attachImgFade(img) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.remove('is-loading');
    return;
  }
  img.addEventListener('load', () => img.classList.remove('is-loading'), { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
}
