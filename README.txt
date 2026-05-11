He Is Allah (com.isokoon.app) — to'liq ma'lumot dumpi
Manba: https://app.isokoon.com/api/
Olingan sana: 2026-04-24

Tuzilish:
- json/*.json             Ilova ishlatadigan ma'lumotlar (faqat arab + uz)
                          names.json — 100 ta ismning meta-ma'lumoti
                          name_translations.json — har isim 3 ta bo'lim
                                                   (qisqacha, ulamolar, dalillar)
                          cards.json — kutubxonadagi kartochka rasmlari
                          languages.json — til ro'yxati (ar, uz)
- voices/*.mp3            — 100 audio tilovat (~2.6 MB)
- images/*.jpg            — 100 fon rasm (~46 MB)
- images/*.svg            — 100 kalligrafiya
- cards/*.jpg             — 57 ko'rgazma kartochkasi (~29 MB)
- icons/*.png             — PWA iconlar

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
  mustaqil ishlay oladi.

Statistika:
- 100 ta ism (Allāh + 99 go'zal ism)
- Ilovada: 2 til (arab + uz), 200 ta tarjima
- Har ism uchun uchta bo'lim: qisqacha ma'noni, ulamolar so'zi, dalillar
- O'zbekcha dalillarda har oyat arabchasi bilan birga ko'rsatiladi
- 361 ta media fayl (~78 MB)
