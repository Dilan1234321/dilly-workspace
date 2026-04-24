"""
End-to-end memory extraction test.

Stresses the full pipeline: user conversation -> extract_memory_items
-> normalize -> save_memory_surface. We don't mock the LLM here — the
purpose is to verify the REGEX path alone catches the literal facts
it needs to catch. When paired with use_llm=True the LLM path adds
inferential facts on top.

Every case below is a realistic snippet of a user chatting with Dilly
about career things. The assertion is that the REGEX extractor
produces at least the listed facts (category + keyword).
"""
from __future__ import annotations

import os
import sys

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_DIR)
WORKSPACE = os.path.normpath(os.path.join(API_DIR, "..", "..", ".."))
if WORKSPACE not in sys.path:
    sys.path.insert(0, WORKSPACE)

from memory_extraction import _regex_extract_from_user_turns  # noqa: E402


def _turns(lines: list[str]) -> list[dict]:
    """Turn a list of user-only lines into alternating user/assistant messages.
    The extractor only reads user turns so the assistant content is filler."""
    out = []
    for i, ln in enumerate(lines):
        out.append({"role": "user", "content": ln})
        out.append({"role": "assistant", "content": "ok"})
    return out


# --------------------------------------------------------------------------
# Each case: (name, user_turns, expected_any_of)
# expected_any_of: list of (category_contains, keyword_contains) tuples —
# the test passes when EVERY expected tuple has a matching extracted item.
# --------------------------------------------------------------------------

CASES = [
    (
        "student-intro",
        [
            "Hey Dilly, I'm a junior at University of Tampa studying Data Science.",
            "I want to go into quantitative finance eventually. I interned at Wells Fargo last summer.",
            "I know Python, SQL, and R pretty well. Been working on a project building a crypto trading bot.",
        ],
        [
            ("education", "data science"),
            ("goal", "quant"),
            ("experience", "wells"),
            ("skill", "python"),
            ("skill", "sql"),
            ("project", "crypto"),
        ],
    ),
    (
        "holder-pivot",
        [
            "I'm a senior product manager at Datadog working on the observability team.",
            "I'm thinking about pivoting into AI product roles. I've shipped 3 major features this year.",
            "My experience with distributed systems and pytorch is what I want to highlight.",
        ],
        [
            ("experience", "datadog"),
            ("goal", "ai"),
            ("skill", "pytorch"),
        ],
    ),
    (
        "seeker-with-rejections",
        [
            "I got rejected from Stripe last week. I'm looking for a new grad SWE role.",
            "I built a recommendation system in my last internship at Netflix. Used kafka and scala.",
            "My goal is to land somewhere with strong backend engineering, maybe Ramp or Mercury.",
        ],
        [
            ("rejection", "stripe"),
            ("experience", "netflix"),
            ("skill", "kafka"),
            ("skill", "scala"),
            ("goal", "backend"),
        ],
    ),
    (
        "single-line-facts",
        [
            "I know Python, React, and TypeScript.",
        ],
        [
            ("skill", "python"),
            ("skill", "react"),
            ("skill", "typescript"),
        ],
    ),
    (
        "past-roles-and-projects",
        [
            "I worked at Airbnb as a data analyst in 2023.",
            "I built a visualization dashboard for guest metrics using Tableau and dbt.",
            "I want to transition to product management.",
        ],
        [
            ("experience", "airbnb"),
            ("project", "dashboard"),
            ("goal", "product"),
        ],
    ),
]


_CATEGORY_ALIASES = {
    # The regex emits these overlapping categories; treat as equivalent
    # for the purpose of "did we extract a forward-looking aspiration".
    "goal": ("goal", "career_interest"),
    "career_interest": ("goal", "career_interest"),
    # Skill coverage: both "skill" and project-context "worked with"
    # satisfy a skill requirement.
    "skill": ("skill", "skill_unlisted", "technical_skill"),
}


def _matches(category_contains: str, keyword_contains: str, items: list[dict]) -> bool:
    cc = category_contains.lower()
    kc = keyword_contains.lower()
    accept = set(_CATEGORY_ALIASES.get(cc, (cc,)))
    for it in items:
        cat = (it.get("category") or "").lower()
        label = (it.get("label") or "").lower()
        value = (it.get("value") or "").lower()
        if any(a in cat for a in accept) and (kc in label or kc in value):
            return True
    return False


def main():
    print("=" * 70)
    print("Memory extraction flow test (regex path)")
    print("=" * 70)

    fails = 0
    for name, lines, expected in CASES:
        turns = _turns(lines)
        items = _regex_extract_from_user_turns(turns)
        missing = []
        for cat_c, kw_c in expected:
            if not _matches(cat_c, kw_c, items):
                missing.append(f"{cat_c}/{kw_c}")
        ok = len(missing) == 0
        mark = "✓" if ok else "✗"
        print(f"{mark} {name:30} extracted={len(items)}, expected={len(expected)}, missing={missing}")
        if not ok:
            fails += 1
            # Show what we actually extracted so the failure is debuggable
            for it in items[:12]:
                print(f"     - {it.get('category'):12} {it.get('label')}: {it.get('value')[:50]}")

    print()
    if fails == 0:
        print(f"ALL {len(CASES)} cases passed")
    else:
        print(f"{fails}/{len(CASES)} cases failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
