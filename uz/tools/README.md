# PDF generator — «Аллоҳнинг гўзал исмлари»

`build_pdf.py` `uz/asmaul-husna.pdf` kitobini saytning oʻz maʼlumotlaridan
(`uz/json/`) qayta yasaydi. Tarjima yoki maqolalar yangilansa, shu skriptni
ishga tushiring — kitob saytdan ortda qolmaydi.

## Ishga tushirish

```sh
pip install reportlab Pillow arabic_reshaper python-bidi svglib
python3 uz/tools/build_pdf.py
```

Natija: `uz/asmaul-husna.pdf` (A4, ~97 sahifa, ~3.4 MB).

## Maʼlumot manbalari

| Fayl | Nima uchun |
|------|-----------|
| `uz/json/names.json` | tartib (`display_order`), arabcha `default_name`, `background_image` |
| `uz/json/name_translations.json` | Kirill ism, qisqa maъно, уламо сўзлари, далиллар (HTML) |
| `uz/json/about.json` | kirish maqolalari (HTML) |
| `uz/images/…` | har bir ism uchun hero fon rasmi |

HTML maydonlar (`*_val`) saytdagi sanitizer bilan bir xil teglar toʻplamiga
tayanadi (`p, br, span[dir,class], strong, em, ul, ol, li, h3-h5, …`).

## Eski (qoʻlda yasalган) PDF'ga nisbatan yaxshilanишlar

- **ﷺ va Qurʼon qавslari ﴿ ﴾** endi Amiri shriftida toʻgʻri chiziladi
  (avval glyf yoʻqligidan boʻsh kvadrat □ chiqar edi).
- **PDF xatчoʻplari (outline)** + bosiladigan, sahifa raqamli **Мундарижа**
  (kitob oxirida).
- **Ixcham** — ismlar uzluksiz oqadi (167 → ~108 sahifa).
- **Kolofон** sahifasi (yopuvchi оyat, manba, nашр sanasi).
- Toʻliq **metama'lumotlar** (title / author / subject / keywords).
- Hero rasmlar **150 dpi**'ga ixchamlanadi + matn oʻqilishi uchun gradient.
- **Repodagi SVG xattotlik** — muqovadagi الله (tilla) va har ismning banner
  ustidagi arabcha ismi (oq) `names.json`'dagi `image` SVG'idan vektor
  sifatida chiziladi (Amiri matn emas).
- **Oyat kartalari** — har dalil oyati o'z tarjimasi bilan bitta krem panel +
  tilla chap-chiziqli kartaga joylanadi (bir butun ko'rinadi).
- Banner ustida faqat arabcha ism; o'zbekcha (Kirill) ism rasm tagida sarlavha.
- Havola (sayt manzili) faqat muqovada; boshqa betlarda faqat sahifa raqami.
- Kirill matn uchun **Noto Sans**, arabcha uchun **Amiri**.

## Shriftlar (`fonts/`)

Hammasi SIL Open Font License (OFL) ostida, qayta tarqatish mumkin:

- **Amiri** (Regular, Bold) — arabcha matn, ﷺ, Qurʼon qавslari
- **Noto Sans** (Regular, Bold, Italic) — Kirill asosiy matn, sarlavhalar

Shriftlar reproduktivlik uchun repoga qoʻшилган, shuning uchun build internetsiz
(masalan CI'da) ham ишлайди.
