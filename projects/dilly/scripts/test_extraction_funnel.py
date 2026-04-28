"""Diagnostic harness for the profile-extraction funnel.

Runs realistic college-student conversations through the regex extractor
(zero LLM cost) and prints the funnel — what each turn produced, what
was caught, what fell through.

Use when "Dilly's not learning my profile" comes back. If a phrasing
in real chat doesn't appear here, add it to _SCENARIOS, run, and watch
which pattern catches it (or doesn't).

Run from repo root:
    python -m projects.dilly.scripts.test_extraction_funnel
"""
from __future__ import annotations

from projects.dilly.api.memory_extraction import _regex_extract_from_user_turns
from projects.dilly.api.memory_surface_store import _normalize_memory_item


_SCENARIOS: list[tuple[str, list[str]]] = [
    (
        "Junior CS student exploring quant",
        [
            "hey dilly, i'm a junior at MIT studying CS",
            "i interned at jane street last summer",
            "i'm trying to break into quant trading",
            "i know python, c++, and some kdb",
            "i have an interview at citadel next week",
            "fun fact, i play club soccer too",
        ],
    ),
    (
        "Sophomore PM hopeful",
        [
            "i'm a sophomore at UT, econ major",
            "i'm in the consulting club, treasurer this year",
            "i want to break into product management",
            "i built a side project called foodtrail, it tracks restaurants",
            "i'm targeting Stripe and Notion for next summer",
            "i'm worried about the technical interview rounds",
        ],
    ),
    (
        "Senior switching from research to industry",
        [
            "i'm a senior, doing research with prof chen on robotics",
            "i graduated from cmu in december",
            "i'm trying to pivot from academia to industry",
            "i want to live in the bay area after graduation",
            "i applied to deepmind and waymo last week",
            "i'm hoping to get an interview at openai",
        ],
    ),
    (
        "Freshman, exploratory",
        [
            "i'm a freshman, still figuring stuff out",
            "i think i want to study cs but maybe also business",
            "i'm taking intro to programming this semester",
            "i love building stuff, mostly arduino and small robots",
            "fun fact, i'm a competitive chess player",
            "i'm based in austin",
        ],
    ),
    (
        "Trivial chitchat — should produce ~zero facts",
        [
            "hey",
            "what's up",
            "lol nice",
            "ok cool",
            "thanks",
            "bye",
        ],
    ),
]


def _run(name: str, user_msgs: list[str]) -> tuple[int, int]:
    msgs = [{"role": "user", "content": m} for m in user_msgs]
    raw = _regex_extract_from_user_turns(msgs)
    normalized = []
    dropped = 0
    for item in raw:
        n = _normalize_memory_item("test@example.com", item)
        if n:
            normalized.append(n)
        else:
            dropped += 1
    print(f"\n=== {name} ===")
    print(f"  user_msgs={len(user_msgs)}  regex_emit={len(raw)}  "
          f"normalized={len(normalized)}  dropped_at_normalize={dropped}")
    if normalized:
        print("  facts:")
        for it in normalized:
            print(f"    [{it['category']:20s}] {it['label']}  →  {it['value']}")
    else:
        print("  (no facts captured)")
    return len(raw), len(normalized)


def main() -> None:
    total_raw = 0
    total_kept = 0
    for name, msgs in _SCENARIOS:
        raw, kept = _run(name, msgs)
        total_raw += raw
        total_kept += kept
    print("\n" + "=" * 60)
    print(f"TOTAL across {len(_SCENARIOS)} scenarios: "
          f"regex_emit={total_raw}  kept_after_normalize={total_kept}")
    print("=" * 60)


if __name__ == "__main__":
    main()
