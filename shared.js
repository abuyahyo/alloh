/* Shared helpers used by app.js (list page) and name.js (detail page). */

export const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
export const DEFAULT_LANG = 'ar';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

export function applyDir(lang) {
  document.documentElement.setAttribute('dir', RTL_LANGS.has(lang) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
}

/**
 * Wire the floating theme toggle. The chosen theme is also written to
 * <html data-theme> by an inline script in <head> before the stylesheet
 * loads, so initial paint already matches. This handler only flips it
 * on click and persists the new choice.
 */
export function bindThemeToggle(btn) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
}

export function buildLangSelect(selectEl, languages, current) {
  selectEl.innerHTML = languages
    .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)}</option>`)
    .join('');
  selectEl.value = current;
}

export function localized(translations, name, lang) {
  const tr = translations.get(name.id) || {};
  return tr[lang] || tr[DEFAULT_LANG] || {};
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
export function iconHeart() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-linejoin="round"/></svg>`;
}

export function showToast(msg) {
  const toast = $('#toast');
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = msg;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 1800);
}

const NO_AUDIO_MSG = {
  ar: 'لا يوجد تسجيل صوتي لهذا الاسم',
  ru: 'Аудио недоступно',
  en: 'No audio for this name',
};
export function audioMissingMsg(lang) {
  return NO_AUDIO_MSG[lang] || NO_AUDIO_MSG.en;
}

/**
 * Wire an <audio> element to a play/pause toggle keyed by name id.
 * Caller provides:
 *   audio       - <audio> element
 *   getName(id) - returns name record or undefined
 *   getLang()   - current UI language (for the missing-audio toast)
 *   onChange()  - called whenever play state changes; UI repaints itself
 *
 * Returns { toggle(id), isPlaying(id) }.
 *
 * Notes on the AbortError filter: when the user taps a different name while
 * one is already playing, audio.pause()+audio.src=… aborts the previous
 * play() promise with AbortError. That is normal and must NOT mark the new
 * track as missing.
 */
export function createAudioController({ audio, getName, getLang, onChange }) {
  const missing = new Set();
  let playingId = null;

  const fireMissing = (id) => {
    missing.add(id);
    if (playingId === id) playingId = null;
    onChange();
    showToast(audioMissingMsg(getLang()));
  };

  audio.addEventListener('ended', () => {
    playingId = null;
    onChange();
  });
  audio.addEventListener('error', () => {
    if (playingId != null) fireMissing(playingId);
  });

  async function toggle(id) {
    const name = getName(id);
    const safeVoice = name ? safeVoicePath(name.voice) : '';
    if (!safeVoice || missing.has(id)) {
      showToast(audioMissingMsg(getLang()));
      onChange();
      return;
    }
    if (playingId === id && !audio.paused) {
      audio.pause();
      playingId = null;
      onChange();
      return;
    }
    audio.pause();
    audio.src = safeVoice;
    playingId = id;
    onChange();
    try {
      await audio.play();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      fireMissing(id);
    }
  }

  return {
    toggle,
    isPlaying: (id) => playingId === id,
    get playingId() { return playingId; },
  };
}

/**
 * Wire an <img>'s loaded/errored states without inline event-handler attrs
 * (so a strict CSP can stay enabled). Pair with markup that has the
 * `is-loading` class — it's removed once the image actually paints.
 */
export function attachImgFade(img) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.remove('is-loading');
    return;
  }
  img.addEventListener('load', () => img.classList.remove('is-loading'), { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
}
