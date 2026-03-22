"""
Layer 1 — Document ingestion.
"""
from typing import List, Optional

from .column_detection import detect_columns, reconstruct_reading_order
from .docx import extract_docx_with_structure
from .pdf import extract_pdf_with_positions
from .table_detection import detect_and_extract_tables
from .txt import extract_plain_text

from ..types import TextChunk, DOCXParagraph


def ingest_document(
    buffer: bytes,
    mime_type: str,
) -> dict:
    """
    Ingest document and return rawText, chunks, layout.
    Returns: { raw_text, chunks, layout, docx_paragraphs? }
    """
    raw_text = ""
    chunks: List[TextChunk] = []
    docx_paragraphs: Optional[List[DOCXParagraph]] = None
    layout = "single_column"

    mime_lower = (mime_type or "").strip().lower()

    if "pdf" in mime_lower or mime_type == "application/pdf":
        chunks = extract_pdf_with_positions(buffer)
        tables, non_table = detect_and_extract_tables(chunks)
        columns = detect_columns(non_table)
        raw_text = reconstruct_reading_order(non_table, columns)
        # Recovery path: if table stripping or column flow is too destructive,
        # fall back to reading order from all chunks.
        full_columns = detect_columns(chunks)
        full_text = reconstruct_reading_order(chunks, full_columns)
        if len(raw_text or "") < int(len(full_text or "") * 0.7):
            raw_text = full_text
        if tables:
            table_text = "\n\n".join(t.content for t in tables)
            raw_text = (raw_text + "\n\n" + table_text) if raw_text else table_text
        if tables:
            layout = "table_heavy" if len(columns) <= 1 else "mixed"
        elif len(columns) > 1:
            layout = "multi_column"

    elif "wordprocessingml" in mime_lower or "docx" in mime_lower:
        docx_paragraphs = extract_docx_with_structure(buffer)
        raw_text = "\n".join(p.text for p in docx_paragraphs if p.text.strip())

    elif "text/plain" in mime_lower or mime_lower.endswith("txt"):
        raw_text = extract_plain_text(buffer)

    else:
        raw_text = extract_plain_text(buffer)

    out: dict = {"raw_text": raw_text, "chunks": chunks, "layout": layout}
    if docx_paragraphs is not None:
        out["docx_paragraphs"] = docx_paragraphs
    return out
