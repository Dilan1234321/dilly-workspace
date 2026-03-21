#!/usr/bin/env python3
"""
Clean training_data.json (LLM few-shot examples only):
- Names: ONLY the person's name (no contact, phone, long line). Derive from filename when needed.
- Remove bad parses: junk names (Teamwork, T H, EDUCATION, etc.) and junk majors (Profits, Present, Europe, etc.)
- Keep only examples with valid name + valid major.
Beta cohort removed; Dilly uses only few-shot from training_data.json.
"""
import json
import os
import re
import sys

# Paths: script is in projects/dilly/scripts/ -> workspace root is 3 levels up
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
TRAINING_PATH = os.path.join(WORKSPACE, "projects", "dilly", "prompts", "training_data.json")

# Valid majors (canonical only - no freeform junk)
VALID_MAJORS = frozenset([
    "Biochemistry", "Data Science", "Computer Science", "Cybersecurity", "Biology", "Chemistry",
    "Biomedical Sciences", "Allied Health", "Nursing", "Finance", "Economics", "Psychology",
    "International Business", "Marketing", "Mathematics", "Accounting", "Criminology", "History",
    "International Studies", "Political Science", "Communication", "Management", "Marine Science",
    "Environmental Science", "Secondary Education", "Advertising and Public Relations",
])

# Names/phrases that are NOT person names
JUNK_NAMES = frozenset(
    "education experience summary objective skills contact profile qualifications employment "
    "references certifications honors activities projects teamwork communication leadership "
    "organization professional unknown c o n t a c t t h well-educated academic writing "
    "prediction on aldana university tampa may page spring creek drive linkedin".split()
)


def _name_has_junk_words(name: str) -> bool:
    """True if name contains obvious non-name words (address, section, etc.)."""
    w = set(name.lower().split())
    junk = frozenset(
    "university tampa may page of spring creek drive linkedin education contact "
    "prediction academic writing summary professional".split()
    )
    return bool(w & junk)


def _strip_contact(text: str) -> str:
    """Remove email, phone, URLs, city/state, long digit runs. Return first 2-4 alpha words."""
    if not text or not text.strip():
        return ""
    for sep in ["|", "\u2022", "•", "\u00b7"]:
        text = text.split(sep)[0].strip()
    text = re.sub(r"\S+@\S+\.\S+", "", text)
    text = re.sub(r"https?://\S+|www\.\S+|linkedin\.com/\S*|linkedin|github", "", text, flags=re.IGNORECASE)
    text = re.sub(r"[\d\s\-\.\(\)]{7,}", " ", text)
    text = re.sub(r"\(?\d{3}\)?\s*\-?\s*\d{3}\s*\-?\s*\d{4}", "", text)
    text = re.sub(r"[A-Za-z\s]+,\s*[A-Z]{2}\b", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    words = [w for w in text.split() if w and w.replace(".", "").replace("-", "").isalpha()][:4]
    if len(words) < 2:
        return ""
    name = " ".join(words[:4])
    if name.lower() in JUNK_NAMES:
        return ""
    return name


def name_from_filename(filename: str) -> str:
    if not filename or not filename.strip():
        return "Unknown"
    base = os.path.basename(filename).strip()
    base, _ = os.path.splitext(base)
    if base.lower().endswith(".docx"):
        base, _ = os.path.splitext(base)
    base = base.replace("_", " ")
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)
    base = re.sub(r"\b(resume|résumé|cv)\b", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\d{4,}", "", base)
    base = re.sub(r"\s+", " ", base).strip()
    if not base or len(base) < 2:
        return "Unknown"
    words = base.split()[:4]
    return " ".join(w.capitalize() for w in words if w.isalpha())


def clean_name(raw: str, filename: str = "") -> str:
    """Return only the person's name. Use filename when raw is junk or has contact."""
    cleaned = _strip_contact(raw)
    if cleaned and len(cleaned.split()) >= 2 and cleaned.lower() not in JUNK_NAMES and not _name_has_junk_words(cleaned):
        return cleaned.title()
    if filename:
        from_file = name_from_filename(filename)
        if from_file != "Unknown":
            return from_file
    return "Unknown"


def is_valid_major(major: str) -> bool:
    if not major or not major.strip():
        return False
    m = major.strip()
    if m in VALID_MAJORS:
        return True
    return False


def run_training():
    with open(TRAINING_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    examples = data.get("examples") or []
    kept = []
    seen = set()
    for ex in examples:
        raw_name = (ex.get("candidate_name") or "").strip()
        major = (ex.get("major") or "").strip()
        filename = ex.get("filename") or ""
        name = clean_name(raw_name, filename)
        if name == "Unknown" or name.lower() in JUNK_NAMES or _name_has_junk_words(name):
            continue
        if not is_valid_major(major):
            continue
        key = (name.lower(), major)
        if key in seen:
            continue
        seen.add(key)
        ex_clean = dict(ex)
        ex_clean["candidate_name"] = name
        ex_clean["major"] = major
        kept.append(ex_clean)
    data["examples"] = kept
    data["count"] = len(kept)
    with open(TRAINING_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Training: kept {len(kept)} examples (removed {len(examples) - len(kept)} bad parses).")


if __name__ == "__main__":
    os.chdir(WORKSPACE)
    run_training()
