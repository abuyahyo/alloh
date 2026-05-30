#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أسماء الله الحسنى — Arabcha (root) nashr uchun PDF kitob generatori.

uz/tools/build_pdf.py ning arabcha, RTL (o'ngdan-chapga) varianti. Root
`json/` ma'lumotlaridan (names.json + name_translations.json[lang=ar] +
about.json) kitob yasaydi.

Arabcha matn ko'p qatorli bo'lgani uchun reportlab'ning oddiy Paragraph'i
RTL'ni to'g'ri bermaydi (qatorlar tartibi buziladi). Shu sabab bu yerda
maxsus RTLPara flowable ishlatiladi: matnni so'zma-so'z o'lchab qatorlarga
bo'ladi, har bir qatorni alohida reshape+bidi qilib o'ngga tekislab chizadi.

Ishga tushirish (repo ildizidan):
    pip install reportlab Pillow arabic_reshaper python-bidi svglib
    python3 tools/build_pdf_ar.py
Natija: asmaul-husna.pdf (repo ildizida)
"""

import io
import os
import re
import html as _html
import json
import datetime
from html.parser import HTMLParser

import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Spacer, PageBreak, Flowable,
    KeepTogether,
)
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing, Group
from svglib.svglib import svg2rlg

# --------------------------------------------------------------------------- #
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
JSON_DIR = os.path.join(REPO, "json")
FONT_DIR = os.path.join(REPO, "uz", "tools", "fonts")   # OFL shriftlar ulashiladi
OUT_PDF = os.path.join(REPO, "asmaul-husna.pdf")
SITE_URL = "abuyahyo.github.io/alloh"

# Ranglar (uz nashri bilan bir xil)
PAPER = HexColor("#fbf7ee")
INK = HexColor("#241f1a")
ACCENT = HexColor("#9a6b2f")
MUTED = HexColor("#8a8170")
QURAN = HexColor("#3a2e1f")

F_AR = "Amiri"
F_AR_B = "Amiri-B"

# Arabcha UI yorliqlar
L_TITLE = "أسماء الله الحسنى"
L_SUBTITLE = "تسعةٌ وتسعون اسمًا ومعانيها"
L_SHORT = "المعنى الإجمالي"
L_MEAN = "أقوال العلماء"
L_EVID = "الأدلة"
L_TOC = "الفهرس"
L_SOURCE = "المصدر"
L_DATE = "تاريخ النشر"

_DIG = {ord(c): d for c, d in zip("0123456789", "٠١٢٣٤٥٦٧٨٩")}


def ar_num(n):
    return str(n).translate(_DIG)


def register_fonts():
    pdfmetrics.registerFont(TTFont(F_AR, os.path.join(FONT_DIR, "Amiri-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(F_AR_B, os.path.join(FONT_DIR, "Amiri-Bold.ttf")))


def shape(text):
    return get_display(arabic_reshaper.reshape(text))


# --------------------------------------------------------------------------- #
#  SVG xattotlik (vektor)
# --------------------------------------------------------------------------- #
def _recolor(node, color):
    for c in getattr(node, "contents", []) or []:
        _recolor(c, color)
    if getattr(node, "fillColor", None) is not None:
        node.fillColor = color
    if getattr(node, "strokeColor", None) is not None:
        node.strokeColor = color


def load_calligraphy(path, color, max_w, max_h):
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
    out, _, _ = load_calligraphy(path, color, target_w, target_w)
    return out


# --------------------------------------------------------------------------- #
#  HTML fragmentni bloklarga ajratish
# --------------------------------------------------------------------------- #
class Block:
    __slots__ = ("kind", "text")

    def __init__(self, kind, text):
        self.kind = kind        # 'p' | 'h' | 'li' | 'verse'
        self.text = text


class FragParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.buf = []
        self.kind = "p"

    def _flush(self):
        text = "".join(self.buf)
        text = text.replace("﻿", "").replace("∎", "•")
        text = re.sub(r"[ \t ]+", " ", text).strip()
        self.buf = []
        if not text:
            return
        kind = self.kind
        stripped = text.lstrip("-∎•– ").strip()
        if stripped.startswith("﴿") or (stripped[:1] == "(" and "﴿" in stripped[:3]):
            kind = "verse"
        self.blocks.append(Block(kind, text))

    def handle_starttag(self, tag, attrs):
        if tag in ("p", "blockquote"):
            self._flush(); self.kind = "p"
        elif tag in ("h3", "h4", "h5", "h6"):
            self._flush(); self.kind = "h"
        elif tag == "li":
            self._flush(); self.kind = "li"
        elif tag == "br":
            self._flush()

    def handle_endtag(self, tag):
        if tag in ("p", "blockquote", "h3", "h4", "h5", "h6", "li"):
            self._flush(); self.kind = "p"

    def handle_data(self, data):
        self.buf.append(data)

    def parse(self, html_str):
        self.feed(html_str or "")
        self.close()
        self._flush()
        return self.blocks


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "").replace("﻿", "").strip()


# --------------------------------------------------------------------------- #
#  RTL paragraf flowable (so'zma-so'z o'rab, har qatorni alohida bidi qiladi)
# --------------------------------------------------------------------------- #
class RTLPara(Flowable):
    def __init__(self, text, font=F_AR, size=13, leading=21, color=INK,
                 align="right", space_before=0, space_after=7, indent=0):
        super().__init__()
        self.text = text
        self.font = font
        self.size = size
        self.leading = leading
        self.color = color
        self.align = align
        self.space_before = space_before
        self.space_after = space_after
        self.indent = indent

    def _wrap_lines(self, avail):
        words = self.text.split(" ")
        lines, cur = [], []
        for wd in words:
            trial = " ".join(cur + [wd])
            if not cur or pdfmetrics.stringWidth(shape(trial), self.font, self.size) <= avail:
                cur.append(wd)
            else:
                lines.append(" ".join(cur))
                cur = [wd]
        if cur:
            lines.append(" ".join(cur))
        return lines

    def wrap(self, availW, availH):
        self.width = availW
        self.lines = self._wrap_lines(availW - self.indent)
        self.height = (len(self.lines) * self.leading
                       + self.space_before + self.space_after)
        return availW, self.height

    def draw(self):
        c = self.canv
        c.setFont(self.font, self.size)
        c.setFillColor(self.color)
        y = self.height - self.space_before - self.size
        for ln in self.lines:
            vis = shape(ln)
            if self.align == "center":
                c.drawCentredString(self.width / 2, y, vis)
            else:
                c.drawRightString(self.width - self.indent, y, vis)
            y -= self.leading


class SectionHead(Flowable):
    """RTL bo'lim sarlavhasi: o'ngда tilla belgi + sarlavha, ostida nozik chiziq."""

    SB = 14
    FS = 15
    RULE_GAP = 6
    SA = 5
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
        base = self.SA + self.RULE_GAP
        c.setFillColor(ACCENT)
        c.rect(w - 3, base, 3, self.FS * 0.82, stroke=0, fill=1)   # o'ng belgi
        c.setFont(F_AR_B, self.FS)
        c.drawRightString(w - 10, base, shape(self.text))
        c.setStrokeColor(self.RULE)
        c.setLineWidth(0.8)
        c.line(0, self.SA, w, self.SA)


class HRule(Flowable):
    def __init__(self, width=None, color=ACCENT, thickness=0.8, pad=8, center=True):
        super().__init__()
        self.seg = width
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


class TocLine(Flowable):
    """Fihrist qatori: o'ngда raqam+ism, chapда sahifa, orasида nuqtalar."""

    def __init__(self, num, name, page, size=12.5, leading=22):
        super().__init__()
        self.num = num
        self.name = name
        self.page = page
        self.size = size
        self.leading = leading

    def wrap(self, availW, availH):
        self.width = availW
        self.height = self.leading
        return availW, self.height

    def draw(self):
        c = self.canv
        w = self.width
        y = (self.leading - self.size) / 2 + 2
        c.setFont(F_AR, self.size)
        c.setFillColor(INK)
        right = shape("%s . %s" % (self.name, ar_num(self.num)))
        c.drawRightString(w, y, right)
        pg = ar_num(self.page)
        c.setFillColor(ACCENT)
        c.drawString(0, y, pg)
        # nuqtali yetaklash
        rw = pdfmetrics.stringWidth(right, F_AR, self.size)
        pw = pdfmetrics.stringWidth(pg, F_AR, self.size)
        c.setFillColor(MUTED)
        c.setFont(F_AR, self.size)
        x = pw + 6
        xr = w - rw - 6
        dots = ""
        dotw = pdfmetrics.stringWidth(".", F_AR, self.size)
        n = max(0, int((xr - x) / dotw))
        if n > 0:
            c.drawString(x, y, "." * n)


# --------------------------------------------------------------------------- #
#  Hujjat shabloni
# --------------------------------------------------------------------------- #
class ArBook(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, **kw)
        m = 2.0 * cm
        frame = Frame(m, 1.6 * cm, A4[0] - 2 * m, A4[1] - m - 1.6 * cm, id="body")
        plain = Frame(m, 1.6 * cm, A4[0] - 2 * m, A4[1] - m - 1.6 * cm, id="plain")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[plain], onPage=self._cover),
            PageTemplate(id="normal", frames=[frame], onPage=self._footer),
        ])
        self.toc_entries = []

    def _cover(self, c, doc):
        c.saveState()
        c.setFont(F_AR, 10)
        c.setFillColor(MUTED)
        c.drawCentredString(A4[0] / 2, 1.4 * cm, SITE_URL)
        c.restoreState()

    def _footer(self, c, doc):
        c.saveState()
        c.setFont(F_AR_B, 12)
        c.setFillColor(ACCENT)
        c.drawString(2.0 * cm, 1.0 * cm, ar_num(doc.page))   # RTL: chap pastki burchak
        c.restoreState()

    def afterFlowable(self, flowable):
        ent = getattr(flowable, "_toc", None)
        if ent:
            num, name, key = ent
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry("%d. %s" % (num, name), key, level=0)
            self.toc_entries.append((num, name, self.page))


def tag_name(flowable, num, name, key):
    flowable._toc = (num, name, key)
    return flowable


# --------------------------------------------------------------------------- #
def load_data():
    with open(os.path.join(JSON_DIR, "names.json"), encoding="utf-8") as f:
        names = json.load(f)
    with open(os.path.join(JSON_DIR, "name_translations.json"), encoding="utf-8") as f:
        trans = {r["gods_name_id"]: r for r in json.load(f) if r["lang"] == "ar"}
    with open(os.path.join(JSON_DIR, "about.json"), encoding="utf-8") as f:
        about = json.load(f)
    names.sort(key=lambda n: n["display_order"])
    about.sort(key=lambda a: int(a.get("display_order", 0)))
    return names, trans, about


def render_blocks(html_str, content_w):
    out = []
    for b in FragParser().parse(html_str):
        if b.kind == "verse":
            txt = b.text.lstrip("-–•∎ ").strip()
            out.append(RTLPara(txt, font=F_AR, size=16, leading=27,
                               color=QURAN, align="center",
                               space_before=4, space_after=8))
        elif b.kind == "h":
            out.append(RTLPara(b.text, font=F_AR_B, size=14, leading=21,
                               color=INK, space_before=8, space_after=4))
        elif b.kind == "li":
            out.append(RTLPara("• " + b.text, font=F_AR, size=13, leading=21,
                               color=INK, space_after=5, indent=12))
        else:
            out.append(RTLPara(b.text, font=F_AR, size=13, leading=21,
                               color=INK, space_after=7))
    return out


def build_story(names, trans, about, content_w, toc_entries=None):
    from reportlab.platypus.doctemplate import NextPageTemplate
    story = [NextPageTemplate("normal")]

    # ---- Muqova ----
    alloh_svg = names[0]["image"]
    story.append(Spacer(1, 5.0 * cm))
    story.append(svg_flowable(os.path.join(REPO, alloh_svg), 5.0 * cm, color=ACCENT))
    story.append(Spacer(1, 0.9 * cm))
    story.append(HRule(width=6 * cm))
    story.append(Spacer(1, 0.5 * cm))
    story.append(RTLPara(L_TITLE, font=F_AR_B, size=30, leading=40,
                         color=INK, align="center", space_after=6))
    story.append(RTLPara(L_SUBTITLE, font=F_AR, size=14, leading=22,
                         color=MUTED, align="center"))
    story.append(PageBreak())

    # ---- Kirish maqolalari ----
    for a in about:
        title = strip_tags(a.get("title_val", ""))
        if not title:
            continue
        story.append(RTLPara(title, font=F_AR_B, size=20, leading=28,
                             color=ACCENT, align="right", space_after=8))
        story.append(HRule(width=4 * cm, center=False))
        story.append(Spacer(1, 0.3 * cm))
        story.extend(render_blocks(a.get("body_val", ""), content_w))
        story.append(PageBreak())

    # ---- Ismlar (har biri yangi sahifadan) ----
    for idx, n in enumerate(names, start=1):
        if idx > 1:
            story.append(PageBreak())
        rec = trans.get(n["id"], {})
        svg = os.path.join(REPO, n.get("image", ""))
        key = "name-%s" % n["id"]
        arabic_name = n.get("default_name", "")

        head = []
        calli, _, _ = load_calligraphy(svg, ACCENT, content_w * 0.55, 3.0 * cm)
        head.append(Spacer(1, 0.5 * cm))
        head.append(tag_name(calli, idx, arabic_name, key))
        head.append(HRule(width=2.4 * cm))
        short = render_blocks(rec.get("short_meaning_val", ""), content_w)
        if short:
            head.append(SectionHead(L_SHORT))
            head.extend(short[:1])
        story.append(KeepTogether(head))
        for fl in short[1:]:
            story.append(fl)

        meanings = render_blocks(rec.get("meanings_val", ""), content_w)
        if meanings:
            story.append(SectionHead(L_MEAN))
            story.extend(meanings)

        evidence = render_blocks(rec.get("evidence_val", ""), content_w)
        if evidence:
            story.append(SectionHead(L_EVID))
            story.extend(evidence)

    # ---- Kolofon ----
    story.append(PageBreak())
    story.append(Spacer(1, 6 * cm))
    story.append(RTLPara("﴿وَلِلَّهِ الْأَسْمَاءُ الْحُسْنَىٰ فَادْعُوهُ بِهَا﴾",
                         font=F_AR, size=20, leading=34, color=QURAN,
                         align="center", space_after=10))
    story.append(RTLPara("سورة الأعراف، الآية ١٨٠", font=F_AR, size=12,
                         leading=18, color=MUTED, align="center"))
    story.append(Spacer(1, 1.2 * cm))
    story.append(HRule(width=5 * cm))
    story.append(Spacer(1, 0.4 * cm))
    today = datetime.date.today().isoformat()
    story.append(RTLPara("%s: %s" % (L_SOURCE, SITE_URL), font=F_AR, size=11,
                         leading=17, color=MUTED, align="center", space_after=2))
    story.append(RTLPara("%s: %s" % (L_DATE, ar_num(today)), font=F_AR, size=11,
                         leading=17, color=MUTED, align="center"))

    # ---- Fihrist (kitob oxirida) ----
    if toc_entries is not None:
        story.append(PageBreak())
        story.append(RTLPara(L_TOC, font=F_AR_B, size=22, leading=30,
                             color=ACCENT, align="right", space_after=8))
        story.append(HRule())
        story.append(Spacer(1, 0.4 * cm))
        for num, name, page in toc_entries:
            story.append(TocLine(num, name, page))
    return story


def main():
    register_fonts()
    names, trans, about = load_data()
    content_w = A4[0] - 2 * (2.0 * cm)

    # 1-o'tish: sahifa raqamlarini yig'ish (fihristsiz)
    doc1 = ArBook(io.BytesIO(), pagesize=A4)
    doc1.build(build_story(names, trans, about, content_w))
    toc = doc1.toc_entries

    # 2-o'tish: fihrist bilan yakuniy fayl
    doc2 = ArBook(OUT_PDF, pagesize=A4, title=L_TITLE,
                  author=SITE_URL,
                  subject="أسماء الله الحسنى التسعة والتسعون ومعانيها")
    doc2.build(build_story(names, trans, about, content_w, toc_entries=toc),
               canvasmaker=_meta_canvas())
    print("Yozildi:", OUT_PDF, "(%d bayt)" % os.path.getsize(OUT_PDF))


def _meta_canvas():
    from reportlab.pdfgen import canvas

    class C(canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.setTitle(L_TITLE)
            self.setAuthor(SITE_URL)
            self.setSubject("أسماء الله الحسنى التسعة والتسعون ومعانيها")
            self.setKeywords("أسماء الله الحسنى, 99 names of Allah, Asmaul Husna")
            self.setCreator("alloh — tools/build_pdf_ar.py")
    return C


if __name__ == "__main__":
    main()
