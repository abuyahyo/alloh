#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Аллоҳнинг гўзал исмлари — PDF kitobni `uz/json/` maʼlumotlaridan qayta yasovchi
generator.

Sayt maʼlumotlari (names.json, name_translations.json, about.json) yangilanganda
shu skriptni ishga tushirib PDF'ni qayta hosil qilish kifoya — kitob saytdan
ortda qolmaydi.

Yaxshilashlar (qoʻlda yasalgan eski PDF'ga nisbatan):
  * ﷺ va Qurʼon qавslari ﴿ ﴾ endi Amiri shriftida toʻgʻri chiziladi
    (avval DejaVu'da glif yoʻqligidan boʻsh kvadrat □ chiqar edi).
  * PDF xatchoʻplari (outline) + bosiladigan, sahifa raqamli Мундарижа.
  * Ortiqcha boʻsh joy yoʻq — ismlar uzluksiz oqadi (sahifa soni ~167 → kamroq).
  * Yopuvchi (kolofon) sahifa: duo, manba, sana.
  * Toʻliq PDF metama'lumotlari (title/author/subject/keywords).
  * Hero rasmlar 150 dpi'ga ixchamlashtiriladi + matn oʻqilishi uchun gradient.
  * Kirill uchun Noto Serif/Sans, arabcha uchun Amiri.

Ishga tushirish (uz/ ichidan yoki repo ildizidan):
    python3 uz/tools/build_pdf.py
Natija: uz/asmaul-husna.pdf
"""

import io
import os
import re
import html
import json
import datetime
from html.parser import HTMLParser

from PIL import Image
import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle, StyleSheet1
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    PageBreak, KeepTogether, Flowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen import canvas

# --------------------------------------------------------------------------- #
#  Yoʻllar
# --------------------------------------------------------------------------- #
HERE = os.path.dirname(os.path.abspath(__file__))
UZ_ROOT = os.path.dirname(HERE)                 # .../alloh/uz
FONT_DIR = os.path.join(HERE, "fonts")
JSON_DIR = os.path.join(UZ_ROOT, "json")
OUT_PDF = os.path.join(UZ_ROOT, "asmaul-husna.pdf")

SITE_URL = "abuyahyo.github.io/alloh/uz"

# --------------------------------------------------------------------------- #
#  Rang palitrasi (saytning qоронгʻи temasiga yaqin, lekin oq qоgʻоzli kitob)
# --------------------------------------------------------------------------- #
PAPER = HexColor("#fbf7ee")     # iliq qreem fon
INK = HexColor("#241f1a")       # asosiy matn
ACCENT = HexColor("#9a6b2f")    # tilla-jigarrang urgʻu (sarlavhalar, chiziqlar)
MUTED = HexColor("#8a8170")     # ikkinchi darajali (footer, manba)
QURAN = HexColor("#3a2e1f")     # arabcha oyat rangi
CARD = HexColor("#f3ead4")      # oyat kartasi foni (iliq krem)

# --------------------------------------------------------------------------- #
#  Shriftlar
# --------------------------------------------------------------------------- #
F_BODY = "Body"            # Noto Serif — Kirill body
F_BODY_B = "Body-B"
F_BODY_I = "Body-I"
F_HEAD = "Head"            # Noto Sans Bold — sarlavhalar
F_HEAD_R = "Head-R"
F_AR = "Arabic"            # Amiri — arabcha matn, ﷺ, ﴿ ﴾
F_AR_B = "Arabic-B"


def register_fonts():
    reg = pdfmetrics.registerFont
    reg(TTFont(F_BODY, os.path.join(FONT_DIR, "NotoSerif-Regular.ttf")))
    reg(TTFont(F_BODY_B, os.path.join(FONT_DIR, "NotoSerif-Bold.ttf")))
    reg(TTFont(F_BODY_I, os.path.join(FONT_DIR, "NotoSerif-Italic.ttf")))
    reg(TTFont(F_HEAD, os.path.join(FONT_DIR, "NotoSans-Bold.ttf")))
    reg(TTFont(F_HEAD_R, os.path.join(FONT_DIR, "NotoSans-Regular.ttf")))
    reg(TTFont(F_AR, os.path.join(FONT_DIR, "Amiri-Regular.ttf")))
    reg(TTFont(F_AR_B, os.path.join(FONT_DIR, "Amiri-Bold.ttf")))
    pdfmetrics.registerFontFamily(
        F_BODY, normal=F_BODY, bold=F_BODY_B, italic=F_BODY_I, boldItalic=F_BODY_B
    )


# --------------------------------------------------------------------------- #
#  Arabcha matnni tayyorlash (reshape + bidi)
# --------------------------------------------------------------------------- #
_AR_RANGES = (
    (0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF),
    (0xFB50, 0xFDFF), (0xFE70, 0xFEFF),
)


def _is_arabic(ch):
    o = ord(ch)
    return any(a <= o <= b for a, b in _AR_RANGES)


def shape_arabic(text):
    """Arabcha matnni vizual tartibga (reshape + bidi) keltirish."""
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)


def _esc(s):
    return html.escape(s, quote=False)


def inline_markup(text, bold=False, italic=False):
    """Kirill/arabcha aralash matnni ReportLab paragraf markupiga aylantirish.

    Arabcha boʻlaklar (jumladan inline ﷺ) Amiri shriftida, reshape+bidi bilan;
    qolgani Noto Serif'da. Qalin/kursiv saqlanadi.
    """
    out = []
    i, n = 0, len(text)
    while i < n:
        arab = _is_arabic(text[i])
        j = i + 1
        while j < n and _is_arabic(text[j]) == arab:
            # boʻshliqlarni joriy boʻlakka qoʻshib yuboramiz (uzilish boʻlmasin)
            if text[j] == " " and j + 1 < n and _is_arabic(text[j + 1]) != arab:
                break
            j += 1
        seg = text[i:j]
        i = j
        if arab and seg.strip():
            piece = '<font name="%s">%s</font>' % (F_AR, _esc(shape_arabic(seg)))
        else:
            piece = _esc(seg)
            if bold:
                piece = "<b>%s</b>" % piece
            if italic:
                piece = "<i>%s</i>" % piece
        out.append(piece)
    return "".join(out)


# --------------------------------------------------------------------------- #
#  HTML fragmentlarini bloklarga ajratuvchi parser
# --------------------------------------------------------------------------- #
class Block:
    __slots__ = ("kind", "runs")

    def __init__(self, kind):
        self.kind = kind          # 'p' | 'h' | 'li' | 'quote'
        self.runs = []            # [(text, bold, italic)] | quote uchun [(text,)]


class FragmentParser(HTMLParser):
    """short_meaning_val / meanings_val / evidence_val / body_val ни bloklarга."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.cur = None
        self.bold = 0
        self.italic = 0
        self.in_quote = False
        self._stack = []          # quote tugaганда qaytadigan blok turi

    def _flush(self):
        if self.cur and any(r[0].strip() for r in self.cur.runs):
            self.blocks.append(self.cur)
        self.cur = None

    def _start(self, kind):
        self._flush()
        self.cur = Block(kind)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("p",):
            self._start("p")
        elif tag in ("h3", "h4", "h5"):
            self._start("h")
        elif tag == "li":
            self._start("li")
        elif tag == "ul" or tag == "ol":
            pass
        elif tag == "span" and "ar-quote" in (a.get("class") or ""):
            self._stack.append(self.cur.kind if self.cur else "p")
            self._flush()
            self.cur = Block("quote")
            self.in_quote = True
        elif tag in ("strong", "b"):
            self.bold += 1
        elif tag in ("em", "i", "u"):
            self.italic += 1
        elif tag == "br":
            if self.cur is not None:
                self.cur.runs.append(("\n", bool(self.bold), bool(self.italic)))

    def handle_endtag(self, tag):
        if tag in ("p", "h3", "h4", "h5", "li"):
            self._flush()
        elif tag == "span" and self.in_quote:
            self._flush()
            self.in_quote = False
            prev = self._stack.pop() if self._stack else "p"
            # span tugagandan keyingi matn yangi paragrafga (bullet'siz) tushadi
            self.cur = Block("p" if prev == "li" else prev)
        elif tag in ("strong", "b"):
            self.bold = max(0, self.bold - 1)
        elif tag in ("em", "i", "u"):
            self.italic = max(0, self.italic - 1)

    def handle_data(self, data):
        if not data:
            return
        if self.cur is None:
            self.cur = Block("p")
        # bir nechta boʻshliq/yangi qatorni bittaга siqamiz (HTML semantikasi)
        data = re.sub(r"\s+", " ", data)
        if data == " " and not self.cur.runs:
            return
        self.cur.runs.append((data, bool(self.bold), bool(self.italic)))

    def close(self):
        super().close()
        self._flush()
        return self.blocks


def runs_to_markup(runs):
    parts = []
    for text, b, i in runs:
        if text == "\n":
            parts.append("<br/>")
        else:
            parts.append(inline_markup(text, b, i))
    return "".join(parts).strip()


# --------------------------------------------------------------------------- #
#  Uslublar (styles)
# --------------------------------------------------------------------------- #
def build_styles():
    ss = StyleSheet1()
    ss.add(ParagraphStyle(
        "Body", fontName=F_BODY, fontSize=10.5, leading=16.5,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=7,
    ))
    ss.add(ParagraphStyle(
        "Bullet", parent=ss["Body"], leftIndent=14, bulletIndent=2,
        spaceAfter=5, alignment=TA_LEFT,
    ))
    ss.add(ParagraphStyle(
        "BulletCont", parent=ss["Body"], leftIndent=14, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "Section", fontName=F_HEAD, fontSize=12, leading=16,
        textColor=ACCENT, spaceBefore=10, spaceAfter=5,
    ))
    ss.add(ParagraphStyle(
        "Intro4", fontName=F_HEAD, fontSize=11.5, leading=15,
        textColor=INK, spaceBefore=10, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        "IntroTitle", fontName=F_HEAD, fontSize=18, leading=23,
        textColor=ACCENT, spaceBefore=4, spaceAfter=12,
    ))
    ss.add(ParagraphStyle(
        "Quote", fontName=F_AR, fontSize=17, leading=30,
        textColor=QURAN, alignment=TA_CENTER, spaceBefore=4, spaceAfter=8,
        wordWrap=None,
    ))
    ss.add(ParagraphStyle(
        "TocH", fontName=F_HEAD, fontSize=20, leading=26,
        textColor=ACCENT, spaceAfter=14,
    ))
    ss.add(ParagraphStyle(
        "Toc0", fontName=F_BODY, fontSize=10.5, leading=18, textColor=INK,
    ))
    ss.add(ParagraphStyle(
        "TocIntro", parent=ss["Toc0"], fontName=F_BODY_I, textColor=MUTED,
    ))
    return ss


# --------------------------------------------------------------------------- #
#  Hero banner flowable (rasm + arabcha xattotlik + Kirill ism)
# --------------------------------------------------------------------------- #
BANNER_H = 4.4 * cm


def prepare_banner_image(path, target_w_px, target_h_px):
    """Rasmni banner nisbatiga qirqib, ixchamlаб, qоронгʻilashtirilган JPEG qaytaradi."""
    img = Image.open(path).convert("RGB")
    iw, ih = img.size
    tr = target_w_px / target_h_px
    ir = iw / ih
    if ir > tr:                     # juda keng → yon tomonini qirqamiz
        nw = int(ih * tr)
        x = (iw - nw) // 2
        img = img.crop((x, 0, x + nw, ih))
    else:                           # juda baland → tepa/pastini qirqamiz
        nh = int(iw / tr)
        y = (ih - nh) // 2
        img = img.crop((0, y, iw, y + nh))
    img = img.resize((target_w_px, target_h_px), Image.LANCZOS)

    # matn oʻqilishi uchun pastdan tepaga qоrongʻi gradient (scrim)
    grad = Image.new("L", (1, target_h_px), 0)
    for y in range(target_h_px):
        t = y / max(1, target_h_px - 1)        # 0=tepa, 1=pasti
        grad.putpixel((0, y), int(150 * (t ** 1.4) + 35))
    grad = grad.resize((target_w_px, target_h_px))
    dark = Image.new("RGB", img.size, (0, 0, 0))
    img = Image.composite(dark, img, grad)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82, optimize=True)
    buf.seek(0)
    return buf


class Banner(Flowable):
    def __init__(self, width, image_path, arabic_name, cyr_name):
        super().__init__()
        self.width = width
        self.height = BANNER_H
        self.image_path = image_path
        self.arabic = shape_arabic(arabic_name) if arabic_name else ""
        self.cyr = cyr_name or ""
        self._buf = None

    def wrap(self, availW, availH):
        self.width = availW
        return availW, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        dpi = 150
        px_w = max(1, int(w / 72 * dpi))
        px_h = max(1, int(h / 72 * dpi))
        if self._buf is None:
            self._buf = prepare_banner_image(self.image_path, px_w, px_h)
        from reportlab.lib.utils import ImageReader
        c.saveState()
        # yumaloq burchakli klип
        p = c.beginPath()
        r = 8
        p.roundRect(0, 0, w, h, r)
        c.clipPath(p, stroke=0)
        c.drawImage(ImageReader(self._buf), 0, 0, width=w, height=h,
                    preserveAspectRatio=False, mask=None)
        c.restoreState()

        # arabcha xattotlik (markazда, teparoq)
        c.setFillColor(HexColor("#ffffff"))
        c.setFont(F_AR, 34)
        c.drawCentredString(w / 2, h * 0.46, self.arabic)
        # Kirill ism (pastroq, urgʻu rangida)
        c.setFillColor(HexColor("#f4e3c2"))
        c.setFont(F_HEAD, 15)
        c.drawCentredString(w / 2, h * 0.16, self.cyr.upper())


class HRule(Flowable):
    def __init__(self, width=None, color=ACCENT, thickness=0.8, pad=4,
                 center=False):
        super().__init__()
        self.seg = width            # chiziq uzunligi (None = toʻliq kenglik)
        self.color = color
        self.thickness = thickness
        self.height = pad
        self.center = center
        self.avail = width

    def wrap(self, availW, availH):
        self.avail = availW
        if self.seg is None:
            self.seg = availW
        return availW, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(self.thickness)
        x0 = (self.avail - self.seg) / 2 if self.center else 0
        c.line(x0, self.height / 2, x0 + self.seg, self.height / 2)


class VerseCard(Flowable):
    """Qurʼon/hadis оyatini krem panel + tilla chap-chiziqli kartaга oladi."""

    PAD_X = 14
    PAD_Y = 9
    GAP_TOP = 4
    GAP_BOTTOM = 8
    BAR_W = 3

    def __init__(self, inner):
        super().__init__()
        self.inner = inner          # markazlashgan Amiri Paragraph (оyat)
        self._iw = self._ih = 0

    def wrap(self, availW, availH):
        self.width = availW
        self._iw = availW - 2 * self.PAD_X - self.BAR_W
        _, self._ih = self.inner.wrap(self._iw, availH)
        self.height = self._ih + 2 * self.PAD_Y + self.GAP_TOP + self.GAP_BOTTOM
        return availW, self.height

    def draw(self):
        c = self.canv
        w = self.width
        panel_h = self._ih + 2 * self.PAD_Y
        y0 = self.GAP_BOTTOM
        c.saveState()
        # krem panel
        c.setFillColor(CARD)
        c.roundRect(0, y0, w, panel_h, 6, stroke=0, fill=1)
        # tilla chap chizigʻi
        c.setFillColor(ACCENT)
        c.roundRect(0, y0, self.BAR_W + 4, panel_h, 6, stroke=0, fill=1)
        c.setFillColor(CARD)
        c.rect(self.BAR_W, y0, 6, panel_h, stroke=0, fill=1)
        c.restoreState()
        self.inner.drawOn(c, self.BAR_W + self.PAD_X, y0 + self.PAD_Y)


# --------------------------------------------------------------------------- #
#  Hujjat shabloni (TOC + outline + footer)
# --------------------------------------------------------------------------- #
class Book(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, **kw)
        m = 2.0 * cm
        frame = Frame(m, 1.6 * cm, A4[0] - 2 * m, A4[1] - m - 1.6 * cm,
                      id="body")
        plain = Frame(m, 1.6 * cm, A4[0] - 2 * m, A4[1] - m - 1.6 * cm,
                      id="plain")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[plain], onPage=self._blank),
            PageTemplate(id="normal", frames=[frame], onPage=self._footer),
        ])

    def _blank(self, c, doc):
        pass

    def _footer(self, c, doc):
        c.saveState()
        c.setFont(F_HEAD_R, 8)
        c.setFillColor(MUTED)
        c.drawCentredString(A4[0] / 2, 1.0 * cm, str(doc.page))
        c.setFont(F_BODY, 7.5)
        c.drawCentredString(A4[0] / 2, 0.62 * cm, SITE_URL)
        c.restoreState()

    def afterFlowable(self, flowable):
        entry = getattr(flowable, "_toc", None)
        if entry:
            level, text, key = entry
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level,
                                      closed=(level == 0))
            self.notify("TOCEntry", (level, text, self.page, key))


def tagged(flowable, level, text, key):
    flowable._toc = (level, text, key)
    return flowable


# --------------------------------------------------------------------------- #
#  Mazmun
# --------------------------------------------------------------------------- #
def load_data():
    with open(os.path.join(JSON_DIR, "names.json"), encoding="utf-8") as f:
        names = json.load(f)
    with open(os.path.join(JSON_DIR, "name_translations.json"), encoding="utf-8") as f:
        trans = {r["gods_name_id"]: r for r in json.load(f)}
    with open(os.path.join(JSON_DIR, "about.json"), encoding="utf-8") as f:
        about = json.load(f)
    names.sort(key=lambda n: n["display_order"])
    about.sort(key=lambda a: a.get("display_order", 0))
    return names, trans, about


def render_fragment(html_str, styles, content_w):
    """HTML fragmentni Platypus flowable roʻyxatiga aylantiradi."""
    blocks = FragmentParser()
    blocks.feed(html_str or "")
    out = []
    for b in blocks.close():
        if b.kind == "quote":
            txt = shape_arabic("".join(r[0] for r in b.runs))
            out.append(VerseCard(Paragraph(_esc(txt), styles["Quote"])))
        elif b.kind == "h":
            out.append(Paragraph(runs_to_markup(b.runs), styles["Intro4"]))
        elif b.kind == "li":
            out.append(Paragraph(runs_to_markup(b.runs), styles["Bullet"],
                                 bulletText="•"))
        else:
            out.append(Paragraph(runs_to_markup(b.runs), styles["Body"]))
    return out


def build_story(names, trans, about, styles, content_w):
    story = []

    # ---- Muqova ----
    story.append(Spacer(1, 5.5 * cm))
    story.append(Paragraph(_esc(shape_arabic("الله")),
                           ParagraphStyle("cov", fontName=F_AR, fontSize=92,
                                          leading=100, alignment=TA_CENTER,
                                          textColor=ACCENT)))
    story.append(Spacer(1, 1.0 * cm))
    story.append(HRule(width=6 * cm, color=ACCENT, center=True))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Аллоҳнинг гўзал исмлари",
                           ParagraphStyle("covt", fontName=F_HEAD, fontSize=30,
                                          leading=36, alignment=TA_CENTER,
                                          textColor=INK)))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("Асмоул-Ҳусна — 99 та исм ва уларнинг маънолари",
                           ParagraphStyle("covs", fontName=F_BODY_I, fontSize=13,
                                          leading=18, alignment=TA_CENTER,
                                          textColor=MUTED)))
    story.append(PageBreak())

    # ---- Мундарижа ----
    toc = TableOfContents()
    toc.levelStyles = [styles["Toc0"]]
    toc.dotsMinLevel = 0
    story.append(Paragraph("Мундарижа", styles["TocH"]))
    story.append(HRule(color=ACCENT))
    story.append(Spacer(1, 0.4 * cm))
    story.append(toc)
    story.append(PageBreak())

    # ---- Kirish maqolalari (about) ----
    for a in about:
        title = strip_tags(a.get("title_val", "")).strip()
        if not title:
            continue
        key = "about-%s" % a.get("id")
        head = Paragraph(_esc(title), styles["IntroTitle"])
        story.append(tagged(head, 0, title, key))
        story.append(HRule(color=ACCENT, width=4 * cm))
        story.append(Spacer(1, 0.3 * cm))
        story.extend(render_fragment(a.get("body_val", ""), styles, content_w))
        story.append(PageBreak())

    # ---- 99 (+1) исм ----
    for idx, n in enumerate(names, start=1):
        rec = trans.get(n["id"], {})
        cyr = (rec.get("name") or "").strip()
        arabic = n.get("default_name", "")
        bg = os.path.join(UZ_ROOT, n.get("background_image", ""))
        key = "name-%s" % n["id"]
        label = "%d. %s" % (idx, cyr)

        head = []
        banner = Banner(content_w, bg, arabic, cyr)
        head.append(tagged(banner, 0, label, key))
        head.append(Spacer(1, 0.35 * cm))
        # qisqa maъно — banner bilan birga (yetim qolmasin)
        short = render_fragment(rec.get("short_meaning_val", ""), styles, content_w)
        head.extend(short[:1])
        story.append(KeepTogether(head))
        for fl in short[1:]:
            story.append(fl)

        meanings = render_fragment(rec.get("meanings_val", ""), styles, content_w)
        if meanings:
            story.append(Paragraph("Уламоларнинг сўзлари", styles["Section"]))
            story.extend(meanings)

        evidence = render_fragment(rec.get("evidence_val", ""), styles, content_w)
        if evidence:
            story.append(Paragraph("Далиллар", styles["Section"]))
            story.extend(evidence)

        story.append(Spacer(1, 0.5 * cm))

    # ---- Kolofon ----
    story.append(PageBreak())
    story.append(Spacer(1, 6 * cm))
    story.append(Paragraph(_esc(shape_arabic(
        "وَلِلَّهِ الْأَسْمَاءُ الْحُسْنَىٰ فَادْعُوهُ بِهَا")),
        ParagraphStyle("colq", fontName=F_AR, fontSize=20, leading=34,
                       alignment=TA_CENTER, textColor=QURAN)))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(
        "«Аллоҳнинг гўзал исмлари бордир. Бас, Унга ўша (исм)лар ила дуо қилинг» "
        "<i>(Аъроф сураси, 180-оят)</i>",
        ParagraphStyle("colt", fontName=F_BODY, fontSize=11, leading=17,
                       alignment=TA_CENTER, textColor=INK)))
    story.append(Spacer(1, 1.2 * cm))
    story.append(HRule(width=5 * cm, color=ACCENT, center=True))
    story.append(Spacer(1, 0.5 * cm))
    today = datetime.date.today().isoformat()
    story.append(Paragraph(
        "Манба ва аудио: %s<br/>Нашр санаси: %s" % (SITE_URL, today),
        ParagraphStyle("colc", fontName=F_BODY, fontSize=9.5, leading=15,
                       alignment=TA_CENTER, textColor=MUTED)))
    return story


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "")


# --------------------------------------------------------------------------- #
def main():
    register_fonts()
    styles = build_styles()
    names, trans, about = load_data()

    doc = Book(
        OUT_PDF, pagesize=A4,
        title="Аллоҳнинг гўзал исмлари",
        author="abuyahyo.github.io/alloh",
        subject="Асмоул-Ҳусна — Аллоҳнинг 99 гўзал исми ва уларнинг маънолари",
    )
    doc.keywords = ("Асмоул-Ҳусна, Аллоҳнинг исмлари, 99 исм, ислом, "
                    "Asmaul Husna, 99 names of Allah, uzbek, oʻzbekcha")

    content_w = A4[0] - 2 * (2.0 * cm)

    # 1-sahifa muqова shabloni (footersiz); 2-sahifadan boshlab oddiy shablon.
    from reportlab.platypus.doctemplate import NextPageTemplate
    story = [NextPageTemplate("normal")]
    story += build_story(names, trans, about, styles, content_w)

    doc.multiBuild(story, canvasmaker=_meta_canvas(doc))
    print("Yozildi:", OUT_PDF, "(%d bayt)" % os.path.getsize(OUT_PDF))


def _meta_canvas(doc):
    """PDF metama'lumotlarini oʻrnatadigan canvas."""
    class C(canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.setTitle("Аллоҳнинг гўзал исмлари")
            self.setAuthor("abuyahyo.github.io/alloh")
            self.setSubject("Асмоул-Ҳусна — Аллоҳнинг 99 гўзал исми")
            self.setKeywords(getattr(doc, "keywords", ""))
            self.setCreator("alloh PWA — uz/tools/build_pdf.py")
    return C


if __name__ == "__main__":
    main()
