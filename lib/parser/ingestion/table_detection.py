"""
Layer 1 — Table detection and extraction.
"""
from typing import List, Tuple

from ..types import TableRegion, TextChunk

Y_TOLERANCE = 3.0
X_SPREAD_THRESHOLD = 100.0


def detect_and_extract_tables(
    chunks: List[TextChunk],
) -> Tuple[List[TableRegion], List[TextChunk]]:
    """
    Group chunks by approximate y-coordinate (tolerance 3pt).
    A row is a table row if it has 2+ chunks with x-coordinate spread > 100pt.
    Consecutive table rows form a table region.
    Return (table_regions, non_table_chunks).
    """
    if not chunks:
        return [], []

    # Group by page
    by_page: dict[int, List[TextChunk]] = {}
    for c in chunks:
        by_page.setdefault(c.page, []).append(c)

    all_tables: List[TableRegion] = []
    all_non_table: List[TextChunk] = []

    for page_num in sorted(by_page.keys()):
        page_chunks = by_page[page_num]
        tables, non_table = _process_page_tables(page_chunks)
        all_tables.extend(tables)
        all_non_table.extend(non_table)

    return all_tables, all_non_table


def _process_page_tables(chunks: List[TextChunk]) -> Tuple[List[TableRegion], List[TextChunk]]:
    """Process one page for table detection."""
    if not chunks:
        return [], []

    # Group by approximate y (same line)
    rows: List[List[TextChunk]] = []
    sorted_chunks = sorted(chunks, key=lambda c: (c.y, c.x))

    current_row: List[TextChunk] = []
    current_y: float = -9999

    for c in sorted_chunks:
        if current_row and abs(c.y - current_y) > Y_TOLERANCE:
            rows.append(current_row)
            current_row = []
        current_row.append(c)
        current_y = c.y
    if current_row:
        rows.append(current_row)

    # Classify rows: table row = 2+ chunks with x spread > 100
    table_rows: List[List[TextChunk]] = []
    non_table_chunks: List[TextChunk] = []

    for row in rows:
        xs = [c.x for c in row]
        x_spread = max(xs) - min(xs) if len(xs) >= 2 else 0
        if len(row) >= 2 and x_spread > X_SPREAD_THRESHOLD:
            table_rows.append(row)
        else:
            non_table_chunks.extend(row)

    # Split consecutive table rows into table regions by y-gap.
    tables: List[TableRegion] = []
    if table_rows:
        sorted_rows = sorted(table_rows, key=lambda row: min(c.y for c in row))
        groups: List[List[List[TextChunk]]] = []
        current_group: List[List[TextChunk]] = []
        prev_y: float | None = None
        for row in sorted_rows:
            y = min(c.y for c in row)
            if prev_y is not None and abs(y - prev_y) > (Y_TOLERANCE * 6):
                if current_group:
                    groups.append(current_group)
                current_group = []
            current_group.append(row)
            prev_y = y
        if current_group:
            groups.append(current_group)

        for grp in groups:
            cells = [" | ".join(c.text for c in row) for row in grp]
            tables.append(
                TableRegion(
                    content="\n".join(cells),
                    rows=[[c.text for c in row] for row in grp],
                )
            )
    return tables, non_table_chunks
