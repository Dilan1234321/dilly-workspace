"""
Layer 1 — Column detection and reading order reconstruction.
"""
from typing import List

from ..types import Column, TextChunk


def detect_columns(chunks: List[TextChunk]) -> List[Column]:
    """
    Sort all x-values. Find consecutive x-values where gap > 50 points.
    Each gap is a column boundary. Return array of {x_start, x_end}.
    If no gaps found, return single column covering 0 to Infinity.
    """
    if not chunks:
        return [Column(x_start=0, x_end=float("inf"))]

    xs = sorted(set(c.x for c in chunks))
    if len(xs) < 2:
        return [Column(x_start=0, x_end=float("inf"))]

    gaps: List[tuple] = []
    for i in range(len(xs) - 1):
        gap = xs[i + 1] - xs[i]
        if gap > 50:
            gaps.append((xs[i], xs[i + 1]))

    if not gaps:
        return [Column(x_start=0, x_end=float("inf"))]

    # Build columns from gaps
    columns: List[Column] = []
    prev_end = 0
    for start, end in gaps:
        if start > prev_end:
            columns.append(Column(x_start=prev_end, x_end=start))
        prev_end = end
    columns.append(Column(x_start=prev_end, x_end=float("inf")))
    return columns


def reconstruct_reading_order(chunks: List[TextChunk], columns: List[Column]) -> str:
    """
    Group chunks by page. For each page:
    - If single column: sort by y asc then x asc. Join with spaces.
      Insert newline when y-gap > average_line_height * 0.8.
    - If multi-column: for each column (left to right), filter by x range,
      sort by y, join. Separate columns with \\n\\n[COLUMN BREAK]\\n\\n.
    Join pages with \\n\\n[PAGE BREAK]\\n\\n.
    """
    if not chunks:
        return ""

    pages: dict[int, List[TextChunk]] = {}
    for c in chunks:
        pages.setdefault(c.page, []).append(c)

    parts: List[str] = []
    for page_num in sorted(pages.keys()):
        page_chunks = pages[page_num]
        # With our PDF y transform, larger y is visually higher on the page.
        page_chunks_sorted = sorted(page_chunks, key=lambda c: (-c.y, c.x))

        if len(columns) <= 1 or columns[0].x_end >= 1e10:
            # Single column
            line_parts: List[str] = []
            prev_y = None
            avg_height = 12.0
            if page_chunks_sorted:
                heights = [c.height for c in page_chunks_sorted if c.height > 0]
                avg_height = sum(heights) / len(heights) if heights else 12
            threshold = avg_height * 0.8

            for c in page_chunks_sorted:
                if prev_y is not None and abs(prev_y - c.y) > threshold:
                    line_parts.append("\n")
                line_parts.append(c.text)
                prev_y = c.y
            parts.append(" ".join(line_parts).replace(" \n ", "\n"))
        else:
            # Multi-column
            col_texts: List[str] = []
            for col in columns:
                col_chunks = [
                    c for c in page_chunks_sorted
                    if col.x_start <= c.x < col.x_end
                ]
                col_chunks = sorted(col_chunks, key=lambda c: (-c.y, c.x))
                prev_y = None
                line_parts = []
                avg_height = 12.0
                if col_chunks:
                    heights = [c.height for c in col_chunks if c.height > 0]
                    avg_height = sum(heights) / len(heights) if heights else 12
                threshold = avg_height * 0.8

                for c in col_chunks:
                    if prev_y is not None and abs(prev_y - c.y) > threshold:
                        line_parts.append("\n")
                    line_parts.append(c.text)
                    prev_y = c.y
                col_texts.append(" ".join(line_parts).replace(" \n ", "\n"))
            parts.append("\n\n[COLUMN BREAK]\n\n".join(col_texts))

        parts.append("\n\n[PAGE BREAK]\n\n")

    return "".join(parts).rstrip("\n\n[PAGE BREAK]\n\n")
