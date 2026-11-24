
<div align="center">

<img src="icons/icon-192.png" width="96" height="96" alt="Аллоҳ">

# Аллоҳ — Ал-Асмо ул-Хусно

**Аллоҳ таолонинг 100 гўзал исми — маъноси, уламолар сўзи, далиллар ва тиловат билан (ўзбекча ва арабча)**

<sub>100 исм · 2 тил · аудио тиловат · каллиграфия · PWA</sub>

</div>

---

## ✨ Имкониятлар

### 📖 Мазмун
- **100 исм** — Аллоҳ + 99 гўзал исм
- Ҳар исм учун **уч бўлим**:
  1. Қисқача маъноси
  2. Уламолар сўзи
  3. Далиллар (оятлар арабчаси билан бирга кўрсатилади)
- **Ўзбекча ва арабча** — 200 таржима (ҳар исм иккала тилда)

### 🎧 Материал
- **Аудио тиловат** — 100 та аудио (жами ~2.6 MB)
- **Фон расмлари ва каллиграфия** — ҳар исм учун 100 фон расм ва 100 каллиграфия (SVG)
- **Кутубхона карточкалари** — 57 кўргазма карточкалари

### 🌐 Ишлаш
- Қора (dark) режим дизайни, RTL/LTR мувозанат
- **PWA** — манифест ва service worker (офлайн, кеш)
- **Мустақил тил нусхалари**:
  - `ar/` — фақат арабча (RTL, тил танлови йўқ)
  - `uz/` — фақат ўзбекча (LTR, тил танлови йўқ)
  - Ҳар бири ўз HTML, JS, CSS, JSON ва медиа файлларига эга, реподан мустақил ишлайди

---

## 🗂 Лойиҳа тузилиши

| Файл/Каталог | Вазифаси |
|------|----------|
| `index.html`, `app.js` | Исмлар рўйхати саҳифаси |
| `name.html`, `name.js` | Исм тафсилотлари саҳифаси |
| `shared.js`, `style.css` | Умумий ёрдамчилар ва dark дизайн |
| `manifest.webmanifest`, `sw.js` | PWA (офлайн, кеш) |
| `json/*.json` | Илова маълумотлари (`names.json`, `name_translations.json`, `cards.json`, `languages.json`) |
| `voices/`, `images/`, `cards/`, `icons/` | Медиа файллари (361 файл, ~78 MB) |
| `ar/`, `uz/` | Мустақил тил нусхалари (ҳар бири ўз таъминоти билан) |

---

## 📖 Манба

Маълумотлар [isokoon.com](https://app.isokoon.com/api/) API'дан олинган (2026-04-24).

---

## 🤝 Ҳисса қўшиш

[Issue](https://github.com/abuyahyo/alloh/issues) ёки Pull Request.

---

<div align="center">
<sub>Аллоҳ қабул қилсин. 🤲</sub>
</div>

---

## 🇬🇧 English

<div align="center">

# Al-Asma ul-Husna (99 Names of Allah)

A multilingual PWA covering all 100 names — Allah and the 99 beautiful names — with meaning, scholarly commentary, evidences and audio recitation, in Uzbek and Arabic.

</div>

### Features
- **100 names**, each with three sections: brief meaning, scholars' word, and evidences (Quranic verses shown with the Arabic text)
- **Two languages** (ar + uz), 200 translations total; dark design with RTL/LTR per language
- **Rich media**: 100 audio recitations, 100 background photos, 100 calligraphy SVGs, 57 gallery cards (~78 MB total)
- **PWA** with manifest + service worker (offline + cache)
- **Standalone copies**: `ar/` and `uz/` are fully self-contained (own HTML/JS/CSS/JSON/media), ready to be moved to their own repos

### Structure
`index.html` + `name.html` (list & details), `app.js` / `name.js` / `shared.js`, `style.css`, `json/` data, `voices/` `images/` `cards/` `icons/` media.

Data source: the isokoon.com public API (fetched 2026-04-24).
