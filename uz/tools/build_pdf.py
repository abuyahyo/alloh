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
from svglib.svglib import svg2rlg

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
F_BODY = "Body"            # Noto Sans — Kirill body (saytdagi sans ko'rinishi)
F_BODY_B = "Body-B"
F_BODY_I = "Body-I"
F_HEAD = "Head"            # Noto Sans Bold — sarlavhalar
F_HEAD_R = "Head-R"
F_AR = "Arabic"            # Amiri — arabcha matn, ﷺ, ﴿ ﴾
F_AR_B = "Arabic-B"


def register_fonts():
    reg = pdfmetrics.registerFont
    reg(TTFont(F_BODY, os.path.join(FONT_DIR, "NotoSans-Regular.ttf")))
    reg(TTFont(F_BODY_B, os.path.join(FONT_DIR, "NotoSans-Bold.ttf")))
    reg(TTFont(F_BODY_I, os.path.join(FONT_DIR, "NotoSans-Italic.ttf")))
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


def _recolor(node, color):
    """rlg daraxtidagi barcha shakllar rangini almashtirish."""
    for c in getattr(node, "contents", []) or []:
        _recolor(c, color)
    if getattr(node, "fillColor", None) is not None:
        node.fillColor = color
    if getattr(node, "strokeColor", None) is not None:
        node.strokeColor = color


def load_calligraphy(path, color, max_w, max_h):
    """SVG xattotlikни qayta ranglab, max o'lchamga sig'dirilgan vektor
    Drawing va uning (kenglik, balandlik)ini qaytaradi."""
    from reportlab.graphics.shapes import Drawing, Group
    d = svg2rlg(path)
    x1, y1, x2, y2 = d.getBounds()
    bw, bh = (x2 - x1) or d.width, (y2 - y1) or d.height
    if color is not None:
        _recolor(d, color)
    s = min(max_w / bw, max_h / bh)
    g = Group(d)
    g.translate(-x1, -y1)
    out = Drawing(bw * s, bh * s)
    out.add(g)
    out.scale(s, s)
    out.hAlign = "CENTER"
    return out, bw * s, bh * s


def svg_flowable(path, target_w, color=None):
    """SVG xattotlikni markazlashgan vektor flowable sifatida qaytaradi."""
    out, _, _ = load_calligraphy(path, color, target_w, target_w)
    return out


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

    def feed_close(self, html_str):
        self.feed(html_str)
        return self.close()


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
        "Body", fontName=F_BODY, fontSize=10.5, leading=17,
        textColor=INK, alignment=TA_LEFT, spaceAfter=7,
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
        "NameTitle", fontName=F_HEAD, fontSize=18, leading=22,
        textColor=ACCENT, alignment=TA_CENTER, spaceBefore=8, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        "Verse", fontName=F_AR, fontSize=15.5, leading=27,
        textColor=QURAN, alignment=TA_CENTER, spaceBefore=0, spaceAfter=0,
        wordWrap=None,
    ))
    ss.add(ParagraphStyle(
        "VerseTrans", fontName=F_BODY, fontSize=9.8, leading=15,
        textColor=INK, alignment=TA_LEFT, spaceBefore=0, spaceAfter=0,
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
    def __init__(self, width, photo_path, svg_path, cyr_name):
        super().__init__()
        self.width = width
        self.height = BANNER_H
        self.image_path = photo_path
        self.svg_path = svg_path
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

        # repodagi SVG xattotlik — oq rangda, markazда (o'qilishi uchun soya)
        from reportlab.graphics import renderPDF
        max_w, max_h = w * 0.50, h * 0.62
        shadow, _, _ = load_calligraphy(self.svg_path, HexColor("#000000"),
                                        max_w, max_h)
        light, dw, dh = load_calligraphy(self.svg_path, HexColor("#ffffff"),
                                         max_w, max_h)
        x = (w - dw) / 2
        y = (h - dh) / 2
        renderPDF.draw(shadow, c, x + 0.8, y - 0.8)
        renderPDF.draw(light, c, x, y)


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


class EvidenceItem(Flowable):
    """Saytdagidek belgili (bullet) dalil: • + oyat (markazда) + tagida tarjima.
    Quti yo'q — yengil ro'yxat ko'rinishi."""

    BULLET_W = 15
    GAP = 3
    SA = 9

    def __init__(self, arabic, trans):
        super().__init__()
        self.arabic = arabic
        self.trans = trans

    def wrap(self, availW, availH):
        self.width = availW
        iw = availW - self.BULLET_W
        _, self.h1 = self.arabic.wrap(iw, availH)
        self.h2 = 0
        if self.trans is not None:
            _, self.h2 = self.trans.wrap(iw, availH)
        body = self.h1 + (self.GAP + self.h2 if self.trans else 0)
        self.height = body + self.SA
        return availW, self.height

    def draw(self):
        c = self.canv
        x = self.BULLET_W
        y_ar = self.SA + self.h2 + (self.GAP if self.trans else 0)
        self.arabic.drawOn(c, x, y_ar)
        if self.trans is not None:
            self.trans.drawOn(c, x, self.SA)
        # belgi — oyatning birinchi qatori bilan tenglashtirib
        c.setFillColor(ACCENT)
        c.setFont(F_BODY, 11)
        c.drawString(2, y_ar + self.h1 - 14, "•")


class SectionHead(Flowable):
    """Bo'lim sarlavhasi: chap tilla belgi + sarlavha + ostida nozik chiziq."""

    SB = 13          # tepa bo'shliq
    FS = 12.5        # shrift o'lchami
    RULE_GAP = 6
    SA = 5           # past bo'shliq
    RULE = HexColor("#e2cfa6")

    def __init__(self, text):
        super().__init__()
        self.text = text

    def wrap(self, availW, availH):
        self.width = availW
        self.height = self.SB + self.FS + self.RULE_GAP + self.SA
        return availW, self.height

    def draw(self):
        c = self.canv
        w = self.width
        base = self.SA + self.RULE_GAP        # matn baseline
        c.setFillColor(ACCENT)
        c.rect(0, base, 3, self.FS * 0.82, stroke=0, fill=1)   # chap belgi
        c.setFont(F_HEAD, self.FS)
        c.drawString(10, base, self.text)
        c.setStrokeColor(self.RULE)
        c.setLineWidth(0.8)
        c.line(0, self.SA, w, self.SA)        # ostidagi nozik chiziq


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
        # muqova: havola faqat shu yerda
        c.saveState()
        c.setFont(F_BODY, 9)
        c.setFillColor(MUTED)
        c.drawCentredString(A4[0] / 2, 1.4 * cm, SITE_URL)
        c.restoreState()

    def _footer(self, c, doc):
        # boshqa betlarda faqat sahifa raqami (havolasiz)
        c.saveState()
        c.setFont(F_HEAD_R, 8)
        c.setFillColor(MUTED)
        c.drawCentredString(A4[0] / 2, 0.85 * cm, str(doc.page))
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
    """HTML fragmentni Platypus flowable roʻyxatiga aylantiradi.

    Saytdagidek: har bir dalil oyati belgili (bullet) ro'yxat elementi —
    • + oyat (markazда) + tagida tarjima. Quti yo'q.
    """
    blocks = FragmentParser().feed_close(html_str or "")
    out = []
    i, n = 0, len(blocks)
    while i < n:
        b = blocks[i]
        if b.kind == "quote":
            txt = shape_arabic("".join(r[0] for r in b.runs))
            arabic = Paragraph(_esc(txt), styles["Verse"])
            trans = None
            # to'g'ridan-to'g'ri keyingi matn — shu oyatning tarjimasi
            if i + 1 < n and blocks[i + 1].kind in ("p", "li"):
                trans = Paragraph(runs_to_markup(blocks[i + 1].runs),
                                  styles["VerseTrans"])
                i += 1
            out.append(EvidenceItem(arabic, trans))
        elif b.kind == "h":
            out.append(Paragraph(runs_to_markup(b.runs), styles["Intro4"]))
        elif b.kind == "li":
            out.append(Paragraph(runs_to_markup(b.runs), styles["Bullet"],
                                 bulletText="•"))
        else:
            out.append(Paragraph(runs_to_markup(b.runs), styles["Body"]))
        i += 1
    return out


def build_story(names, trans, about, styles, content_w):
    story = []

    # ---- Muqova ----
    alloh_svg = os.path.join(UZ_ROOT, names[0]["image"])
    story.append(Spacer(1, 5.0 * cm))
    story.append(svg_flowable(alloh_svg, 5.0 * cm, color=ACCENT))
    story.append(Spacer(1, 0.9 * cm))
    story.append(HRule(width=6 * cm, color=ACCENT, center=True))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Аллоҳнинг гўзал исмлари",
                           ParagraphStyle("covt", fontName=F_HEAD, fontSize=30,
                                          leading=36, alignment=TA_CENTER,
                                          textColor=INK)))
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
        bg = os.path.join(UZ_ROOT, n.get("background_image", ""))
        svg = os.path.join(UZ_ROOT, n.get("image", ""))
        key = "name-%s" % n["id"]
        label = "%d. %s" % (idx, cyr)

        head = []
        banner = Banner(content_w, bg, svg, cyr)
        head.append(tagged(banner, 0, label, key))
        head.append(Paragraph(_esc(cyr.upper()), styles["NameTitle"]))
        head.append(HRule(width=2.4 * cm, color=ACCENT, center=True, pad=8))
        # qisqa maъно — sarlavha bilan, banner bilan birga (yetim qolmasin)
        short = render_fragment(rec.get("short_meaning_val", ""), styles, content_w)
        if short:
            head.append(SectionHead("Қисқача маъноси"))
            head.extend(short[:1])
        story.append(KeepTogether(head))
        for fl in short[1:]:
            story.append(fl)

        meanings = render_fragment(rec.get("meanings_val", ""), styles, content_w)
        if meanings:
            story.append(SectionHead("Уламоларнинг сўзлари"))
            story.extend(meanings)

        evidence = render_fragment(rec.get("evidence_val", ""), styles, content_w)
        if evidence:
            story.append(SectionHead("Далиллар"))
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

    # ---- Мундарижа (kitob oxirida) ----
    story.append(PageBreak())
    toc = TableOfContents()
    toc.levelStyles = [styles["Toc0"]]
    toc.dotsMinLevel = 0
    story.append(Paragraph("Мундарижа", styles["TocH"]))
    story.append(HRule(color=ACCENT))
    story.append(Spacer(1, 0.4 * cm))
    story.append(toc)
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
