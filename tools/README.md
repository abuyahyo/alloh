# PDF generator — أسماء الله الحسنى (arabcha nashr)

`build_pdf_ar.py` root (arabcha) nashr uchun `asmaul-husna.pdf` kitobini
saytning o'z ma'lumotlaridan (`json/`) yasaydi. Bu `uz/tools/build_pdf.py`
ning RTL (o'ngdan-chapga) varianti.

## Ishga tushirish

```sh
pip install reportlab Pillow arabic_reshaper python-bidi svglib
python3 tools/build_pdf_ar.py
```

Natija: `asmaul-husna.pdf` (repo ildizida, A4, ~111 sahifa).

## Tafsilotlar

- Ma'lumot: `json/names.json` + `json/name_translations.json` (`lang=ar`) +
  `json/about.json`. Har ism uchun arabcha xattotlik `names.json`'dagi `image`
  SVG'idan vektor sifatida (tilla rangda) chiziladi.
- **RTL renderer:** arabcha matn ko'p qatorli bo'lgani uchun reportlab'ning
  oddiy `Paragraph`'i qator tartibini buzadi. Shu sabab `RTLPara` flowable
  matnni so'zma-so'z o'lchab qatorlarga bo'lib, har qatorni alohida
  reshape+bidi qilib o'ngga tekislab chizadi.
- Sahifa raqamlari arabcha (٠–٩), chap pastki burchakda. Fihrist (الفهرس)
  kitob oxirida; sahifa raqamlari ikki o'tishli (two-pass) build bilan
  aniqlanadi.
- Shriftlar `uz/tools/fonts/` dan ulashiladi (Amiri Regular/Bold, OFL).

Uz nashri uchun `uz/tools/README.md` ga qarang.
