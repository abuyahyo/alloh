/* Shared helpers used by app.js (list page) and name.js (detail page). */

export const RTL_LANGS = new Set(['ar', 'fa', 'ur']);
export const DEFAULT_LANG = 'ar';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const UI_STRINGS = {
  ar: {
    search: 'البحث',
    clear_search: 'مسح البحث',
    language: 'اللغة',
    theme_dark: 'الوضع الداكن',
    theme_light: 'الوضع الفاتح',
    favorites_show: 'إظهار المفضلة فقط',
    favorites_all: 'إظهار الكل',
    favorites_empty: 'لا توجد أسماء في المفضلة',
    play: 'تشغيل',
    pause: 'إيقاف مؤقت',
    loading: 'جارٍ التحميل…',
    favorite: 'إضافة إلى المفضلة',
    unfavorite: 'إزالة من المفضلة',
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
    share: 'مشاركة',
    share_failed: 'تعذر المشاركة',
    library: 'مكتبة المرئيات',
    cards: 'البطاقات',
    videos: 'مقاطع فيديو',
    home: 'الرئيسية',
    no_results: 'لا توجد نتائج',
    load_failed: 'تعذر تحميل المحتوى. حاول تحديث الصفحة.',
    not_found: 'الاسم غير موجود',
    no_audio: 'لا يوجد تسجيل صوتي لهذا الاسم',
    pwa_title: 'هو الله',
  },
  ru: {
    search: 'Поиск',
    clear_search: 'Очистить поиск',
    language: 'Язык',
    theme_dark: 'Тёмная тема',
    theme_light: 'Светлая тема',
    favorites_show: 'Показать только избранное',
    favorites_all: 'Показать всё',
    favorites_empty: 'В избранном пока пусто',
    play: 'Воспроизвести',
    pause: 'Пауза',
    loading: 'Загрузка…',
    favorite: 'Добавить в избранное',
    unfavorite: 'Убрать из избранного',
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
    share: 'Поделиться',
    share_failed: 'Не удалось поделиться',
    library: 'Медиатека',
    cards: 'Карточки',
    videos: 'Видео',
    home: 'Главная',
    no_results: 'Ничего не найдено',
    load_failed: 'Не удалось загрузить. Попробуйте обновить страницу.',
    not_found: 'Имя не найдено',
    no_audio: 'Аудио недоступно',
    pwa_title: 'Он — Аллах',
  },
  en: {
    search: 'Search',
    clear_search: 'Clear search',
    language: 'Language',
    theme_dark: 'Dark mode',
    theme_light: 'Light mode',
    favorites_show: 'Show favorites only',
    favorites_all: 'Show all',
    favorites_empty: 'No favorites yet',
    play: 'Play',
    pause: 'Pause',
    loading: 'Loading…',
    favorite: 'Add to favorites',
    unfavorite: 'Remove from favorites',
    short_meaning: 'Brief meaning',
    meanings: 'Scholars’ sayings',
    evidence: 'Evidence',
    effects: 'Spiritual effects',
    pray: 'Supplication',
    mercy: 'Reflections',
    benefits: 'Benefits and rulings',
    no_content: 'No content',
    ar_only: 'This section is available in Arabic only',
    copied: 'Copied',
    share: 'Share',
    share_failed: 'Sharing failed',
    library: 'Media library',
    cards: 'Cards',
    videos: 'Videos',
    home: 'Home',
    no_results: 'No results',
    load_failed: 'Could not load. Please refresh the page.',
    not_found: 'Name not found',
    no_audio: 'No audio for this name',
    pwa_title: 'He Is Allah',
  },
};

export function tFor(lang, key) {
  const set = UI_STRINGS[lang] || UI_STRINGS[DEFAULT_LANG];
  return set[key] || UI_STRINGS[DEFAULT_LANG][key] || UI_STRINGS.en[key] || '';
}

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}`);
  return r.json();
}

export function applyDir(lang) {
  document.documentElement.setAttribute('dir', RTL_LANGS.has(lang) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (meta) meta.setAttribute('content', tFor(lang, 'pwa_title'));
}

/**
 * Wire the floating theme toggle. The chosen theme is also written to
 * <html data-theme> by an inline script in <head> before the stylesheet
 * loads, so initial paint already matches. This handler flips it on
 * click, persists the new choice, and keeps the aria-label in sync
 * with the action it would perform next.
 */
export function bindThemeToggle(btn, getLang = () => DEFAULT_LANG) {
  if (!btn) return () => {};
  const sync = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-label', tFor(getLang(), dark ? 'theme_light' : 'theme_dark'));
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  };
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', next); } catch (e) {}
    sync();
  });
  sync();
  return sync;
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
export function iconLoading() {
  return `<svg class="spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>`;
}
export function iconHeart() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-linejoin="round"/></svg>`;
}
export function iconClose() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
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

/**
 * Wire an <audio> element to a play/pause toggle keyed by name id.
 * Caller provides:
 *   audio       - <audio> element
 *   getName(id) - returns name record or undefined
 *   getLang()   - current UI language (for the missing-audio toast)
 *   onChange()  - called whenever play state changes; UI repaints itself
 *
 * Returns { toggle(id), isPlaying(id), isLoading(id) }.
 *
 * Notes on the AbortError filter: when the user taps a different name while
 * one is already playing, audio.pause()+audio.src=… aborts the previous
 * play() promise with AbortError. That is normal and must NOT mark the new
 * track as missing.
 */
export function createAudioController({ audio, getName, getLang, onChange }) {
  const missing = new Set();
  let playingId = null;
  let loadingId = null;

  const fireMissing = (id) => {
    missing.add(id);
    if (playingId === id) playingId = null;
    if (loadingId === id) loadingId = null;
    onChange();
    showToast(tFor(getLang(), 'no_audio'));
  };

  audio.addEventListener('playing', () => {
    if (loadingId != null) {
      loadingId = null;
      onChange();
    }
  });
  audio.addEventListener('ended', () => {
    playingId = null;
    loadingId = null;
    onChange();
  });
  audio.addEventListener('error', () => {
    if (playingId != null) fireMissing(playingId);
    else if (loadingId != null) fireMissing(loadingId);
  });

  async function toggle(id) {
    const name = getName(id);
    const safeVoice = name ? safeVoicePath(name.voice) : '';
    if (!safeVoice || missing.has(id)) {
      showToast(tFor(getLang(), 'no_audio'));
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
      // 'playing' event will clear loadingId; if play() resolved before that
      // (some browsers), clear it here as a fallback.
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
