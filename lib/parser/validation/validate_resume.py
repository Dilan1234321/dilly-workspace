"""
Layer 4 — Validation and parser warnings.
"""
from dataclasses import replace
from typing import List

from ..types import ParsedResume, ParserWarning, ExtractedField
from ..fields.name import _is_likely_name


def validate_parsed_resume(resume: ParsedResume) -> ParsedResume:
    """Run checks, add to parser_warnings for each failure."""
    warnings: List[ParserWarning] = list(resume.parser_warnings)

    # Name
    name_val = resume.name.value if resume.name else None
    if name_val:
        if name_val and not _is_likely_name(name_val):
            warnings.append(ParserWarning(field="name", message="Name fails heuristic", severity="medium"))
        if len((name_val or "").split()) < 2 or len((name_val or "").split()) > 5:
            warnings.append(ParserWarning(field="name", message="Name word count out of range", severity="low"))
        if len(name_val or "") >= 60:
            warnings.append(ParserWarning(field="name", message="Name too long", severity="low"))

    # Email
    email_val = resume.email.value if resume.email else None
    if email_val and "@" not in email_val:
        warnings.append(ParserWarning(field="email", message="Invalid email format", severity="high"))

    # GPA
    edu_val = resume.education.value if resume.education else []
    if edu_val:
        for e in edu_val:
            if e.gpa:
                try:
                    v = float(e.gpa)
                    if v < 0 or v > 4.0:
                        warnings.append(ParserWarning(field="gpa", message=f"GPA {e.gpa} out of range", severity="medium"))
                except ValueError:
                    warnings.append(ParserWarning(field="gpa", message=f"Invalid GPA format: {e.gpa}", severity="medium"))

    # Experience dates
    exp_val = resume.experience.value if resume.experience else []
    if exp_val:
        for e in exp_val:
            if e.start_date and e.end_date and e.end_date not in ("Present", "Current", "Now"):
                try:
                    import re
                    y1 = re.search(r"\d{4}", str(e.start_date))
                    y2 = re.search(r"\d{4}", str(e.end_date))
                    if y1 and y2 and int(y1.group()) > int(y2.group()):
                        warnings.append(ParserWarning(field="experience", message="Start date after end date", severity="medium"))
                except Exception:
                    pass

    # Graduation dates
    if edu_val:
        for e in edu_val:
            if e.graduation_date:
                import re
                m = re.search(r"\d{4}", str(e.graduation_date))
                if m:
                    y = int(m.group())
                    if y < 1950 or y > 2035:
                        warnings.append(ParserWarning(field="education", message="Graduation date out of range", severity="low"))

    return replace(resume, parser_warnings=warnings)
