"""
Layer 1 — DOCX ingestion with structure (styles, bold, font size, etc.).
"""
import re
import zipfile
from io import BytesIO
from typing import List
from xml.etree import ElementTree as ET

from ..types import DOCXParagraph

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}


def _text(elem: ET.Element) -> str:
    if elem is None:
        return ""
    t = elem.text or ""
    for child in elem:
        t += _text(child)
        if child.tail:
            t += child.tail
    return t




def extract_docx_with_structure(buffer: bytes) -> List[DOCXParagraph]:
    """
    Parse DOCX from buffer. Extract paragraphs with style, bold, font size, indentation.
    """
    paragraphs: List[DOCXParagraph] = []
    try:
        with zipfile.ZipFile(BytesIO(buffer), "r") as zf:
            if "word/document.xml" not in zf.namelist():
                return paragraphs
            xml_bytes = zf.read("word/document.xml")
    except Exception:
        return paragraphs

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return paragraphs

    w_ns = NS["w"]
    for p_elem in root.iter("{%s}p" % w_ns):
        style = None
        p_pr = p_elem.find("w:pPr", NS)
        if p_pr is not None:
            p_style = p_pr.find("w:pStyle", NS)
            if p_style is not None:
                style = p_style.get("{%s}val" % NS["w"]) or p_style.get("val")

        indentation = 0
        if p_pr is not None:
            ind = p_pr.find("w:ind", NS)
            if ind is not None:
                left = ind.get("{%s}left" % NS["w"]) or ind.get("left")
                if left:
                    try:
                        indentation = int(left)
                    except ValueError:
                        pass

        is_bold = False
        is_italic = False
        font_size: float | None = None
        text_parts: List[str] = []
        is_list_item = False
        list_level = 0

        if p_pr is not None:
            num_pr = p_pr.find("w:numPr", NS)
            if num_pr is not None:
                is_list_item = True
                ilvl = num_pr.find("w:ilvl", NS)
                if ilvl is not None:
                    raw_lvl = ilvl.get("{%s}val" % NS["w"]) or ilvl.get("val")
                    try:
                        list_level = int(raw_lvl) if raw_lvl is not None else 0
                    except ValueError:
                        list_level = 0

        for r in p_elem.findall("w:r", NS):
            r_pr = r.find("w:rPr", NS)
            if r_pr is not None:
                b = r_pr.find("w:b", NS)
                if b is not None:
                    is_bold = True
                i = r_pr.find("w:i", NS)
                if i is not None:
                    is_italic = True
                sz = r_pr.find("w:sz", NS)
                if sz is not None:
                    val = sz.get("{%s}val" % NS["w"]) or sz.get("val")
                    if val:
                        try:
                            font_size = int(val) / 2.0  # half-points to points
                        except ValueError:
                            pass
            t = r.find("w:t", NS)
            if t is not None:
                text_parts.append(_text(t))

        text = "".join(text_parts).strip()
        if not text:
            continue

        heading_styles = ("Heading1", "Heading2", "Heading3", "heading1", "heading2", "heading3")
        is_heading = style in heading_styles if style else False

        paragraphs.append(
            DOCXParagraph(
                text=text,
                style=style,
                is_bold=is_bold,
                is_italic=is_italic,
                font_size=font_size,
                indentation=indentation,
                is_list_item=is_list_item,
                list_level=list_level,
                is_heading_style=is_heading,
            )
        )

    return paragraphs
