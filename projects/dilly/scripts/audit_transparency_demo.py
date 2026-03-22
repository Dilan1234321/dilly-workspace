#!/usr/bin/env python3
"""
Run a full audit on ONE person from training data and print every step.
100% transparency: raw text → parse → structured file → audit → scores, evidence, recommendations.
"""
import json
import os
import sys

# Run from workspace root (script is in projects/meridian/scripts → go up 3 to workspace)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
if WORKSPACE not in sys.path:
    sys.path.insert(0, WORKSPACE)
os.chdir(WORKSPACE)

def main():
    # Load training data and pick one person (Kate M. Hicks - rich content)
    training_path = os.path.join(SCRIPT_DIR, "..", "prompts", "training_data.json")
    training_path = os.path.normpath(training_path)
    with open(training_path, "r") as f:
        data = json.load(f)
    examples = data.get("examples") or data.get("items") or []
    if not examples:
        print("No examples in training data.")
        return
    ex = examples[0]  # Kate M. Hicks
    raw_text = (ex.get("resume_excerpt") or ex.get("resume_text") or "").strip()
    filename = ex.get("filename") or ""

    print("=" * 80)
    print("MERIDIAN AUDIT — FULL PIPELINE (100% TRANSPARENCY)")
    print("=" * 80)
    print()

    # STEP 1: Raw resume text (first 1200 chars)
    print("STEP 1: RAW RESUME TEXT (input)")
    print("-" * 80)
    print(raw_text[:1200] + ("..." if len(raw_text) > 1200 else ""))
    print()
    print(f"[Total length: {len(raw_text)} chars]")
    print()

    # STEP 2: Parse resume
    print("STEP 2: PARSE RESUME (name, major, GPA, sections)")
    print("-" * 80)
    from dilly_core.resume_parser import parse_resume
    parsed = parse_resume(raw_text, filename=filename)
    print(f"  name:        {parsed.name!r}")
    print(f"  major:       {parsed.major!r}")
    print(f"  gpa:         {parsed.gpa}")
    print(f"  section keys: {list(parsed.sections.keys())}")
    for k, v in list(parsed.sections.items())[:4]:
        preview = (v[:120] + "...") if len(v) > 120 else v
        print(f"    [{k}]: {preview!r}")
    if len(parsed.sections) > 4:
        print(f"    ... and {len(parsed.sections) - 4} more sections")
    print()

    # STEP 3: Build structured resume text
    print("STEP 3: STRUCTURED RESUME TEXT (what gets written & sent to LLM)")
    print("-" * 80)
    from dilly_core.structured_resume import build_structured_resume_text
    structured_text = build_structured_resume_text(parsed)
    print(structured_text[:2200] + ("..." if len(structured_text) > 2200 else ""))
    print()
    print(f"[Structured length: {len(structured_text)} chars]")
    print()

    # STEP 4: Write to parsed_resumes/ (optionally LLM-clean when use_llm)
    print("STEP 4: WRITE TO parsed_resumes/")
    print("-" * 80)
    from dilly_core.structured_resume import write_parsed_resume, get_parsed_resumes_dir, get_email_from_parsed
    candidate_name = parsed.name or "Unknown"
    if not candidate_name or candidate_name == "Unknown":
        candidate_name = "Kate_M_Hicks"  # from training data
    file_key = get_email_from_parsed(parsed) or candidate_name
    path = write_parsed_resume(parsed, file_key)
    use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes") and os.environ.get("OPENAI_API_KEY")
    if use_llm and structured_text:
        try:
            from dilly_core.llm_structured_resume import clean_structured_resume_with_llm
            cleaned = clean_structured_resume_with_llm(structured_text)
            if cleaned and cleaned.strip():
                with open(path, "w", encoding="utf-8") as f:
                    f.write(cleaned)
                structured_text = cleaned
                print("  LLM-cleaned structured resume written.")
        except Exception:
            pass
    print(f"  Written to: {path}")
    print()

    # STEP 5: Run audit (same logic as API: structured text for LLM when available)
    text_for_audit = structured_text if use_llm else (parsed.normalized_text or raw_text)
    print("STEP 5: RUN AUDIT")
    print("-" * 80)
    print(f"  use_llm:     {use_llm}")
    print(f"  text used:   {'structured (with [SECTION] labels)' if use_llm else 'normalized text'}")
    print(f"  text length: {len(text_for_audit)} chars")
    print()

    if use_llm:
        from dilly_core.llm_auditor import run_audit_llm
        result = run_audit_llm(
            text_for_audit,
            candidate_name=candidate_name,
            major=parsed.major or "Unknown",
            gpa=parsed.gpa,
            fallback_to_rules=True,
            filename=filename,
        )
    else:
        from dilly_core.auditor import run_audit
        result = run_audit(
            text_for_audit,
            candidate_name=candidate_name,
            major=parsed.major or "Unknown",
            gpa=parsed.gpa,
            filename=filename,
        )

    # STEP 6: Scores
    print("STEP 6: SCORES")
    print("-" * 80)
    print(f"  Smart:  {result.smart_score:.1f}")
    print(f"  Grit:   {result.grit_score:.1f}")
    print(f"  Build:  {result.build_score:.1f}")
    print(f"  Final:  {result.final_score:.1f}")
    print(f"  Track:  {result.track}")
    print()

    # STEP 7: Evidence (personalized explanations per dimension)
    print("STEP 7: EVIDENCE (personalized explanations — what user sees per dimension)")
    print("-" * 80)
    es = getattr(result, "evidence_smart_display", None)
    eg = getattr(result, "evidence_grit_display", None)
    eb = getattr(result, "evidence_build_display", None)
    print("  SMART:")
    print(f"    {es or '(none)'}")
    print("  GRIT:")
    print(f"    {eg or '(none)'}")
    print("  BUILD:")
    print(f"    {eb or '(none)'}")
    print()

    # STEP 8: Audit findings
    print("STEP 8: AUDIT FINDINGS (narrative summary)")
    print("-" * 80)
    for i, finding in enumerate(result.audit_findings or [], 1):
        print(f"  {i}. {finding}")
    print()

    # STEP 9: Recommendations
    print("STEP 9: RECOMMENDATIONS")
    print("-" * 80)
    for i, rec in enumerate(result.recommendations or [], 1):
        typ = getattr(rec, "type", rec.get("type") if isinstance(rec, dict) else "?")
        title = getattr(rec, "title", rec.get("title") if isinstance(rec, dict) else "")
        action = getattr(rec, "action", rec.get("action") if isinstance(rec, dict) else "")
        print(f"  {i}. [{typ}] {title}")
        print(f"     {action}")
        if isinstance(rec, dict) and rec.get("current_line"):
            print(f"     current_line:  {rec.get('current_line', '')[:80]}...")
        if isinstance(rec, dict) and rec.get("suggested_line"):
            print(f"     suggested_line: {rec.get('suggested_line', '')[:80]}...")
    if not (result.recommendations or []):
        print("  (none)")
    print()
    print("=" * 80)
    print("END OF PIPELINE")
    print("=" * 80)


if __name__ == "__main__":
    main()
