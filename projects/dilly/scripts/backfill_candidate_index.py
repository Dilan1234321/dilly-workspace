#!/usr/bin/env python3
"""
Backfill candidate index for recruiter semantic search.

Iterates all Meridian profiles that have at least one audit, builds the candidate
document, embeds it, and saves candidate_index.json in the user's profile folder.
Assumes every student consents to being visible to recruiters (joining the app = consent).

Run from the workspace root (the folder that contains 'projects/' and 'memory/'):

  python3 projects/meridian/scripts/backfill_candidate_index.py
  python3 projects/meridian/scripts/backfill_candidate_index.py --force   # reindex even if index exists
  python3 projects/meridian/scripts/backfill_candidate_index.py --dry-run
  python3 projects/meridian/scripts/backfill_candidate_index.py --limit 10

Requires OPENAI_API_KEY for embeddings. Skips users with no audits.
"""

import argparse
import json
import os
import sys

_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

_PROFILES_DIR = os.path.join(_ROOT, "memory", "dilly_profiles")
_PROFILE_FILENAME = "profile.json"


def _iter_emails_with_audits():
    """Yield (email, profile, latest_audit) for each profile that has at least one audit."""
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.profile_store import get_profile

    if not os.path.isdir(_PROFILES_DIR):
        return
    for uid in sorted(os.listdir(_PROFILES_DIR)):
        path = os.path.join(_PROFILES_DIR, uid, _PROFILE_FILENAME)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            continue
        email = (prof.get("email") or "").strip().lower()
        if not email:
            continue
        audits = get_audits(email)
        if not audits:
            continue
        profile = get_profile(email) or prof
        latest_audit = audits[0]
        yield email, profile, latest_audit


def _load_resume_text(email: str, profile: dict | None = None, max_chars: int = 50_000) -> str | None:
    """Load parsed resume text for the user; try email-based file first, then fallback by name (e.g. last name in filename)."""
    try:
        from dilly_core.structured_resume import get_parsed_resumes_dir, read_parsed_resume, safe_filename_from_key
        dir_path = get_parsed_resumes_dir()
        if not dir_path or not os.path.isdir(dir_path):
            return None
        filename = safe_filename_from_key(email)
        filepath = os.path.join(dir_path, filename)
        if not os.path.isfile(filepath):
            filepath = None
            name = (profile or {}).get("name") or ""
            if name and isinstance(name, str):
                parts = name.strip().split()
                last = parts[-1].lower() if parts else ""
                if last and len(last) > 2:
                    for f in os.listdir(dir_path):
                        if last in f.lower() and f.endswith(".txt"):
                            candidate = os.path.join(dir_path, f)
                            if os.path.isfile(candidate):
                                filepath = candidate
                                break
        if not filepath:
            return None
        raw = read_parsed_resume(filepath)
        if not raw or not raw.strip():
            return None
        text = raw.strip()
        if len(text) > max_chars:
            text = text[: max_chars - 80] + "\n\n[... truncated ...]"
        return text
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Backfill candidate index for recruiter search.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write; only report who would be indexed.")
    parser.add_argument("--force", action="store_true", help="Reindex even when candidate_index.json already exists.")
    parser.add_argument("--limit", type=int, default=0, help="Max number of candidates to process (0 = no limit).")
    args = parser.parse_args()

    from projects.dilly.api.candidate_index import index_candidate_after_audit, load_candidate_embedding

    total = 0
    skipped_no_audit = 0
    skipped_has_index = 0
    indexed = 0
    failed = 0

    for email, profile, latest_audit in _iter_emails_with_audits():
        total += 1
        if args.limit and indexed + failed >= args.limit:
            break

        if not args.force and load_candidate_embedding(email) is not None:
            skipped_has_index += 1
            continue

        if args.dry_run:
            print(f"[dry-run] would index: {email}")
            indexed += 1
            continue

        resume_text = _load_resume_text(email, profile=profile)
        ok = index_candidate_after_audit(
            email,
            profile=profile,
            audit=latest_audit,
            resume_text=resume_text,
        )
        if ok:
            indexed += 1
            print(f"Indexed: {email}")
        else:
            failed += 1
            print(f"Failed: {email}", file=sys.stderr)

    print()
    print(f"Done. Total with audits: {total}, skipped (already indexed): {skipped_has_index}, indexed: {indexed}, failed: {failed}.")


if __name__ == "__main__":
    main()
