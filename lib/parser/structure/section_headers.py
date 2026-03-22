"""
Layer 2 — Section header detection.
"""
from collections import defaultdict
from typing import Dict, List, Optional

from ..types import DetectedHeader, TextChunk, DOCXParagraph
from .fuzzy_match import fuzzy_match_header
from .section_header_dictionary import SECTION_HEADER_MAP


def _body_font_avg(chunks: List[TextChunk], skip_top_fraction: float = 0.15) -> float:
    """Median font size of chunks, excluding top 15% of document."""
    if not chunks:
        return 12.0
    sorted_by_y = sorted(chunks, key=lambda c: (c.page, c.y))
    n = len(sorted_by_y)
    skip = int(n * skip_top_fraction)
    considered = sorted_by_y[skip:]
    if not considered:
        return 12.0
    sizes = sorted(c.font_size for c in considered if c.font_size > 0)
    if not sizes:
        return 12.0
    mid = len(sizes) // 2
    return sizes[mid] if len(sizes) % 2 else (sizes[mid - 1] + sizes[mid]) / 2


def detect_section_headers(
    raw_text: str,
    chunks: List[TextChunk],
    docx_paragraphs: Optional[List[DOCXParagraph]] = None,
) -> List[DetectedHeader]:
    """
    For each line in rawText (skipping top 15% by position), compute header score.
    If score >= 5.0: classify as section header. Look up canonical name.
    """
    headers: List[DetectedHeader] = []
    lines = raw_text.split("\n")
    body_avg = _body_font_avg(chunks) if chunks else 12.0

    # Build fast lookup for style signals from chunk lines.
    chunk_line_stats = _build_chunk_line_stats(chunks)
    non_empty_lines = [l for l in lines if l.strip()]
    # Keep this conservative so we do not miss early EDUCATION headers.
    top_skip_count = min(int(len(non_empty_lines) * 0.15), 2)
    emitted_non_empty = 0

    # DOCX: map line index to paragraph
    docx_by_line: dict[int, DOCXParagraph] = {}
    if docx_paragraphs:
        idx = 0
        for p in docx_paragraphs:
            if p.text.strip():
                docx_by_line[idx] = p
                idx += 1

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        # Skip top 15% of non-empty lines (name/contact region)
        if emitted_non_empty < top_skip_count:
            emitted_non_empty += 1
            continue
        emitted_non_empty += 1

        score = 0.0
        is_all_caps = stripped.isupper() and len(stripped) > 1
        if is_all_caps:
            score += 3.0
        word_count = len(stripped.split())
        if word_count < 5:
            score += 1.0
        if stripped.endswith(":"):
            score += 1.0

        # Followed by blank
        if i + 1 < len(lines) and not lines[i + 1].strip():
            score += 1.5
        # Preceded by blank
        if i > 0 and not lines[i - 1].strip():
            score += 1.5

        # Chunk style signals
        stats = chunk_line_stats.get(stripped.lower(), {})
        if stats.get("is_bold"):
            score += 2.5
        if stats.get("font_size", 0.0) > body_avg + 2.0:
            score += 2.0
        if stats.get("is_only_text_on_line"):
            score += 1.0

        # Dictionary match
        low = stripped.lower().strip()
        if low in SECTION_HEADER_MAP:
            score += 4.0
        elif fuzzy_match_header(stripped):
            score += 2.5

        # DOCX heading style
        if docx_paragraphs and i in docx_by_line and getattr(docx_by_line[i], "is_heading_style", False):
            score += 5.0

        if score >= 5.0:
            canonical = SECTION_HEADER_MAP.get(low) or fuzzy_match_header(stripped) or "UNMAPPED"
            headers.append(
                DetectedHeader(
                    text=stripped,
                    canonical=canonical,
                    original=stripped,
                    line_index=i,
                    confidence=min(score, 10.0),
                )
            )

    return headers


def _build_chunk_line_stats(chunks: List[TextChunk]) -> Dict[str, dict]:
    """
    Build rough style features per reconstructed line text using chunk groupings.
    """
    if not chunks:
        return {}

    by_page: Dict[int, List[TextChunk]] = defaultdict(list)
    for c in chunks:
        by_page[c.page].append(c)

    out: Dict[str, dict] = {}
    for page_chunks in by_page.values():
        sorted_chunks = sorted(page_chunks, key=lambda c: (c.y, c.x))
        if not sorted_chunks:
            continue
        avg_h = sum(max(c.height, 1.0) for c in sorted_chunks) / len(sorted_chunks)
        tol = max(2.0, avg_h * 0.5)

        lines: List[List[TextChunk]] = []
        current: List[TextChunk] = []
        current_y = -9999.0
        for c in sorted_chunks:
            if current and abs(c.y - current_y) > tol:
                lines.append(current)
                current = []
            current.append(c)
            current_y = c.y
        if current:
            lines.append(current)

        for line_chunks in lines:
            text = " ".join(ch.text.strip() for ch in line_chunks if ch.text.strip()).strip()
            if not text:
                continue
            key = text.lower()
            avg_size = sum(ch.font_size for ch in line_chunks) / max(len(line_chunks), 1)
            is_bold = any(ch.font_weight == "bold" for ch in line_chunks)
            stats = out.get(key)
            candidate = {
                "font_size": avg_size,
                "is_bold": is_bold,
                "is_only_text_on_line": len(line_chunks) <= 4,
            }
            if not stats:
                out[key] = candidate
            else:
                # Keep strongest visual signal if duplicate line appears.
                out[key] = {
                    "font_size": max(stats.get("font_size", 0.0), candidate["font_size"]),
                    "is_bold": bool(stats.get("is_bold")) or candidate["is_bold"],
                    "is_only_text_on_line": bool(stats.get("is_only_text_on_line")) or candidate["is_only_text_on_line"],
                }
    return out
