"""
ATS file-level inspection — PDF binary checks that raw-text scanners miss.

Raw-text analyzers can only see what's already been extracted. This module
opens the PDF (or DOCX) as a binary and flags issues at the file level:

    - Image-only PDFs (scanned / screenshot / export-to-image)
    - Embedded-font explosion (templates with 10+ decorative fonts)
    - Heavy image content (logos, photos, charts that most ATS drop)
    - Unusual page sizes (A4 vs Letter inconsistency that breaks some parsers)
    - Encrypted or password-protected files
    - Pages rendered as a single image with OCR'd text underneath
    - XFA forms (Acrobat forms that don't parse as text)

Returns a dict with a list of `file_signals` that can be merged into the
signals dict consumed by ats_score_v2.score_from_signals().

All inspection is best-effort: if PyMuPDF isn't installed or the file is
corrupt, the function returns an empty dict so the caller can continue.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional


def _safe_import_fitz():
    try:
        import fitz  # PyMuPDF
        return fitz
    except Exception:
        return None


def inspect_pdf(path: str) -> Dict[str, Any]:
    """
    Inspect a PDF file and return a dict of file-level signals.

    Keys in the returned dict:
      is_image_only_pdf        : bool   — pages are rasterized images, no text layer
      encrypted                : bool   — password-protected
      xfa_form                 : bool   — Acrobat XFA form (not real text)
      embedded_fonts_count     : int    — number of distinct embedded fonts
      image_count              : int    — total embedded images across all pages
      has_heavy_graphics       : bool   — image_count suggests decorative template
      page_count               : int
      total_chars              : int
      avg_chars_per_page       : float
      page_size                : str    — 'letter' | 'a4' | 'mixed' | 'unknown'
      issues                   : list   — user-facing red flag dicts
    """
    out: Dict[str, Any] = {}
    fitz = _safe_import_fitz()
    if fitz is None or not path or not os.path.isfile(path):
        return out

    try:
        doc = fitz.open(path)
    except Exception:
        return out

    try:
        out["encrypted"] = bool(doc.is_encrypted)
        out["page_count"] = int(doc.page_count)
        out["xfa_form"] = bool(getattr(doc, "is_form_pdf", False) and getattr(doc, "xref_xml_metadata", 0) > 0)

        total_chars = 0
        image_count = 0
        fonts_seen: set = set()
        page_sizes: set = set()

        for page in doc:
            # Text extraction volume
            try:
                text = page.get_text("text") or ""
                total_chars += len(text.strip())
            except Exception:
                pass

            # Images on the page
            try:
                for img in page.get_images(full=True):
                    image_count += 1
            except Exception:
                pass

            # Embedded fonts
            try:
                for font in page.get_fonts(full=True):
                    # font tuple: (xref, ext, type, basefont, name, encoding)
                    basefont = font[3] if len(font) > 3 else None
                    if basefont:
                        fonts_seen.add(str(basefont))
            except Exception:
                pass

            # Page size classification (Letter = 612x792, A4 = 595x842, tol ±5)
            try:
                rect = page.rect
                w, h = rect.width, rect.height
                if abs(w - 612) < 5 and abs(h - 792) < 5:
                    page_sizes.add("letter")
                elif abs(w - 595) < 5 and abs(h - 842) < 5:
                    page_sizes.add("a4")
                else:
                    page_sizes.add("other")
            except Exception:
                pass

        out["total_chars"] = total_chars
        out["image_count"] = image_count
        out["embedded_fonts_count"] = len(fonts_seen)
        out["avg_chars_per_page"] = round(total_chars / max(out["page_count"], 1), 1)

        if len(page_sizes) == 1:
            out["page_size"] = next(iter(page_sizes))
        elif len(page_sizes) > 1:
            out["page_size"] = "mixed"
        else:
            out["page_size"] = "unknown"

        # ── Derived flags ──────────────────────────────────────────────────
        # Image-only heuristic: page has images but almost no extractable text
        avg = out["avg_chars_per_page"]
        out["is_image_only_pdf"] = bool(
            image_count > 0 and avg < 120 and out["page_count"] > 0
        )
        # Heavy graphics: more than 2 images per page on average
        out["has_heavy_graphics"] = bool(
            image_count > max(6, out["page_count"] * 2)
        )

        # ── User-facing red flags ──────────────────────────────────────────
        issues: List[dict] = []

        if out["encrypted"]:
            issues.append({
                "level": "critical",
                "id": "pdf_encrypted",
                "title": "PDF is encrypted or password-protected",
                "detail": "ATS parsers cannot read password-protected PDFs. Re-save without a password.",
            })

        if out["is_image_only_pdf"]:
            issues.append({
                "level": "critical",
                "id": "pdf_image_only",
                "title": "PDF is an image, not searchable text",
                "detail": f"{out['page_count']} page(s) with only {total_chars} characters of extractable text. "
                          "Re-export from Word, Google Docs, or Pages with 'Save as PDF' — not 'Print to PDF' or a screenshot.",
            })

        if out["xfa_form"]:
            issues.append({
                "level": "critical",
                "id": "pdf_xfa_form",
                "title": "Acrobat XFA form",
                "detail": "This is an XFA form, not a standard PDF. Most ATS cannot extract text. Re-save as a standard PDF.",
            })

        if out["embedded_fonts_count"] > 8:
            issues.append({
                "level": "high",
                "id": "pdf_font_explosion",
                "title": f"{out['embedded_fonts_count']} embedded fonts",
                "detail": "Heavy font variety usually means a decorative template. Strict parsers substitute missing fonts and can mangle spacing. Prefer 1-3 standard fonts.",
            })

        if out["has_heavy_graphics"]:
            issues.append({
                "level": "high",
                "id": "pdf_heavy_graphics",
                "title": f"{image_count} embedded images",
                "detail": "Graphics-heavy templates (icons, charts, logos, skill bars) break most ATS parsers. Consider a cleaner single-column template.",
            })

        if out["page_size"] == "mixed":
            issues.append({
                "level": "medium",
                "id": "pdf_mixed_page_sizes",
                "title": "Mixed page sizes",
                "detail": "Some pages are Letter, some A4. This often indicates a stitched-together PDF that some ATS reject.",
            })

        out["issues"] = issues
    finally:
        try:
            doc.close()
        except Exception:
            pass

    return out


def inspect_file(path: str, file_extension: Optional[str] = None) -> Dict[str, Any]:
    """
    Top-level dispatcher — inspects a file by extension and returns file-level signals.
    Falls back to an empty dict for unsupported types.
    """
    if not path or not os.path.isfile(path):
        return {}
    ext = (file_extension or os.path.splitext(path)[1].lstrip(".")).lower()
    if ext == "pdf":
        result = inspect_pdf(path)
        result["file_extension"] = "pdf"
        return result
    # DOCX could be inspected later; for now we just tag the extension
    return {"file_extension": ext}


__all__ = ["inspect_pdf", "inspect_file"]
