"""
Layer 1 — PDF ingestion with positional data.
Uses PyMuPDF (fitz) for text extraction with coordinates. Does not use pdf-parse.
"""
from typing import List

from ..types import TextChunk

try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False


def extract_pdf_with_positions(buffer: bytes) -> List[TextChunk]:
    """
    Extract text from PDF with position data for each chunk.
    PDF origin is bottom-left; we flip y so top of page = smaller y.
    Uses get_text("dict") for spans with bbox, font, size.
    """
    if not PYMUPDF_AVAILABLE:
        return _fallback_pypdf_extract(buffer)

    chunks: List[TextChunk] = []
    doc = fitz.open(stream=buffer, filetype="pdf")

    for page_num, page in enumerate(doc):
        page_num_1 = page_num + 1
        page_height = page.rect.height

        try:
            blocks = page.get_text("dict", sort=True).get("blocks", [])
        except Exception:
            blocks = []

        page_chunks = 0
        for block in blocks:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = (span.get("text") or "").strip()
                    if not text:
                        continue

                    bbox = span.get("bbox") or (0, 0, 0, 0)
                    x0, y0, x1, y1 = bbox[0], bbox[1], bbox[2], bbox[3]
                    # Flip y: PDF origin is bottom-left
                    y = page_height - y1
                    width = max(0, x1 - x0)
                    height = max(0, y1 - y0) or 12

                    font_size = span.get("size") or height or 12
                    font_name = span.get("font") or ""
                    font_weight = "bold" if "bold" in (font_name or "").lower() else "normal"

                    chunks.append(
                        TextChunk(
                            text=text,
                            x=x0,
                            y=y,
                            width=width,
                            height=height,
                            font_size=float(font_size),
                            font_weight=font_weight,
                            font_name=font_name,
                            page=page_num_1,
                        )
                    )
                    page_chunks += 1
        # Fallback: if dict gave nothing for this page, use words
        if page_chunks == 0:
            _add_chunks_from_words(page, page_height, page_num_1, chunks)

    doc.close()

    # Guardrail: if fitz extraction is suspiciously short, prefer pypdf fallback.
    fitz_len = sum(len(c.text) for c in chunks)
    if fitz_len < 1500:
        fallback_chunks = _fallback_pypdf_extract(buffer)
        fb_len = sum(len(c.text) for c in fallback_chunks)
        if fb_len > fitz_len * 1.3:
            return fallback_chunks
    return chunks


def _add_chunks_from_words(page, page_height: float, page_num: int, chunks: List[TextChunk]) -> None:
    """Fallback: build chunks from get_text('words') when dict fails."""
    words = page.get_text("words", sort=True)
    for item in words:
        if len(item) < 5:
            continue
        x0, y0, x1, y1, text = item[0], item[1], item[2], item[3], item[4]
        if not (text or "").strip():
            continue
        y = page_height - y1
        width = max(0, x1 - x0)
        height = max(12, y1 - y0)
        chunks.append(
            TextChunk(
                text=text.strip(),
                x=x0,
                y=y,
                width=width,
                height=height,
                font_size=height,
                font_weight="normal",
                font_name="",
                page=page_num,
            )
        )


def _fallback_pypdf_extract(buffer: bytes) -> List[TextChunk]:
    """Fallback when PyMuPDF not available: use pypdf, no positions."""
    try:
        from pypdf import PdfReader
        from io import BytesIO

        reader = PdfReader(BytesIO(buffer))
        chunks: List[TextChunk] = []
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if not text.strip():
                continue
            # Simulate single chunk per page
            chunks.append(
                TextChunk(
                    text=text.strip(),
                    x=0,
                    y=0,
                    width=0,
                    height=12,
                    font_size=12,
                    font_weight="normal",
                    font_name="",
                    page=page_num + 1,
                )
            )
        return chunks
    except Exception:
        return []
