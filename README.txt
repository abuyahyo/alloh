He Is Allah (com.isokoon.app) — to'liq ma'lumot dumpi
Manba: https://app.isokoon.com/api/
Olingan sana: 2026-04-24

Tuzilish:
- heisallah_full.db       SQLite database (16 til, manba zaxirasi — ilova bu fayldan foydalanmaydi)
- raw_api/*.json          API dan olingan xom 16 tildagi javoblar (to'liq dump, ilova ishlatmaydi)
- json/*.json             Ilova ishlatadigan ma'lumotlar (faqat arab + uz)
                          arabic_full.json — qo'shimcha arabcha to'plam
- csv/*.csv               Har jadval CSV (UTF-8-BOM, Excel ochadi, manba zaxirasi)
    + names_arabic_flat.csv        — arab tilida 100 ism yassi
    + names_all_languages.csv      — 100 ism 16 tilda matrix
- excel/he_is_allah_arabic.xlsx    — arab-yo'naltirilgan (4 varaq)
- excel/he_is_allah_all_languages.xlsx — har til alohida varaq
- voices/*.mp3            — 100 audio tilovat (~2.6 MB)
- images/*.jpg            — 100 fon rasm (~46 MB)
- images/*.svg            — 100 kalligrafiya
- cards/*.jpg             — 57 ko'rgazma kartochkasi (~29 MB)

Veb ilova (PWA):
- index.html, name.html   — ikkita sahifa: ro'yxat va ism tafsiloti
- app.js, name.js         — sahifa logikasi (vanilla ES modules)
- shared.js               — umumiy yordamchilar va tarjimalar
- style.css               — qora rejim dizayni, RTL/LTR mos ravishda
- manifest.webmanifest    — PWA manifesti
- sw.js                   — service worker (kesh + offline)

Mustaqil tilga ajratilgan nusxalar (kelajakda alohida repoga ko'chirish uchun):
- ar/                     — faqat arabcha (til tanlovi yo'q, html lang="ar" dir="rtl")
- uz/                     — faqat o'zbekcha (til tanlovi yo'q, html lang="uz" dir="ltr")
  Har biri o'zining HTML, JS, CSS, JSON va media fayllariga ega; rootdan
  mustaqil ishlay oladi. Yangilangan tarjima/dizaynni masterda qilib,
  keyin shu papkalarni qayta yaratish tavsiya etiladi.

Statistika:
- 100 ta ism (Allāh + 99 go'zal ism)
- Ilovada: 2 til (arab + uz), 200 ta tarjima
- Har ism uchun uchta bo'lim: qisqacha ma'noni, ulamolar so'zi, dalillar
- O'zbekcha dalillarda har oyat arabchasi bilan birga ko'rsatiladi
- raw_api/, csv/, excel/, db: 16 tilda to'liq 1600 ta tarjima (manba zaxirasi)
- 4 ta arabcha bloglar (json/blogs.json — ilova hozircha ko'rsatmaydi)
- 11 ta references (json/refrences.json: ar, en, id, pt, tr, ur, zh)
- 361 ta media fayl (~78 MB)
