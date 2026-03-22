"""
Layer 2 — Section segmentation.
"""
from typing import List

from ..types import DocumentSection, DetectedHeader


def segment_into_sections(
    raw_text: str,
    headers: List[DetectedHeader],
) -> List[DocumentSection]:
    """
    Sort headers by line_index. For each header, content = lines from after
    the header line to before the next header. Also preamble = content before first header.
    """
    lines = raw_text.split("\n")
    sections: List[DocumentSection] = []

    sorted_headers = sorted(headers, key=lambda h: h.line_index)

    # Preamble: before first header
    if sorted_headers:
        first_idx = sorted_headers[0].line_index
        preamble_lines = lines[:first_idx]
        preamble_content = "\n".join(preamble_lines).strip()
        if preamble_content:
            sections.append(
                DocumentSection(
                    canonical="PREAMBLE",
                    original_header="",
                    content=preamble_content,
                    start_line=0,
                    end_line=first_idx,
                )
            )
    else:
        # No headers: entire doc is preamble
        sections.append(
            DocumentSection(
                canonical="PREAMBLE",
                original_header="",
                content=raw_text.strip(),
                start_line=0,
                end_line=len(lines),
            )
        )
        return sections

    for i, h in enumerate(sorted_headers):
        start = h.line_index + 1
        end = sorted_headers[i + 1].line_index if i + 1 < len(sorted_headers) else len(lines)
        content_lines = lines[start:end]
        content = "\n".join(content_lines).strip()
        sections.append(
            DocumentSection(
                canonical=h.canonical,
                original_header=h.original,
                content=content,
                start_line=start,
                end_line=end,
            )
        )

    return sections
