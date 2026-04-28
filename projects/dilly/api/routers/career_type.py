"""
/career-type — Dilly's 8-question Career Type assessment.

Lightweight Profile-bootstrapping instrument. Not pop psychology — eight
forced-choice questions about how the user actually likes to work, scored
into one of six career archetypes that shape downstream features:

  - BUILDER     — likes to ship things, tolerates ambiguity, hands on
  - CONNECTOR   — energized by people, brokers relationships, sales/PM-y
  - SYNTHESIZER — finds patterns across data/research/disciplines
  - OPERATOR    — keeps systems running, process-oriented, reliable
  - INVENTOR    — thinks ten years out, idea-first, low patience for ops
  - GUARDIAN    — cares about safety/ethics/correctness, the catch-the-bug type

The result is saved as TWO durable Profile facts:
  - category=career_archetype, label=<TYPE>, value=<one-line rationale>
  - category=preference, label=Working style, value=<top 3 choices the user picked>

Every downstream feature (resume framing, mock interview style,
chat coaching tone) can read profile.career_archetype and adjust.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from projects.dilly.api import deps, errors

router = APIRouter(tags=["career-type"])


# Each question: stem + 4 forced choices, each tagged with weights
# across the six archetypes. Picking a choice adds its weights to the
# user's running score; the highest score after 8 questions wins.
QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "energy_source",
        "prompt": "When the work is going well, where's the energy coming from?",
        "choices": [
            {"id": "build",  "label": "Shipping a thing that didn't exist before",                "weights": {"BUILDER": 3, "INVENTOR": 1}},
            {"id": "people", "label": "Connecting people or closing a deal",                       "weights": {"CONNECTOR": 3, "OPERATOR": 1}},
            {"id": "insight","label": "Finding the pattern nobody else saw",                       "weights": {"SYNTHESIZER": 3, "INVENTOR": 1}},
            {"id": "system", "label": "Watching a system you built run smoothly without you",      "weights": {"OPERATOR": 3, "GUARDIAN": 1}},
        ],
    },
    {
        "id": "ambiguity",
        "prompt": "You're handed a task with no spec, no examples, no clear definition of done. What do you do?",
        "choices": [
            {"id": "prototype","label": "Start prototyping in 10 minutes; iterate from there",     "weights": {"BUILDER": 3, "INVENTOR": 1}},
            {"id": "ask",      "label": "Find the right people, ask questions until it's clear",  "weights": {"CONNECTOR": 2, "OPERATOR": 1, "GUARDIAN": 1}},
            {"id": "research", "label": "Read everything related, write my own spec, then start", "weights": {"SYNTHESIZER": 3, "GUARDIAN": 1}},
            {"id": "frame",    "label": "Sketch the bigger problem this is part of, then choose", "weights": {"INVENTOR": 3, "SYNTHESIZER": 1}},
        ],
    },
    {
        "id": "team_role",
        "prompt": "On any team, you naturally end up...",
        "choices": [
            {"id": "doer",     "label": "Doing the work that nobody else has time to do",         "weights": {"BUILDER": 2, "OPERATOR": 2}},
            {"id": "voice",    "label": "Articulating what the team is trying to accomplish",     "weights": {"CONNECTOR": 2, "INVENTOR": 2}},
            {"id": "checker",  "label": "Catching the thing about to break",                      "weights": {"GUARDIAN": 3, "OPERATOR": 1}},
            {"id": "mapper",   "label": "Drawing the map of how all the pieces fit",              "weights": {"SYNTHESIZER": 3, "INVENTOR": 1}},
        ],
    },
    {
        "id": "stress_response",
        "prompt": "Crunch time, deadline tomorrow. What's your move?",
        "choices": [
            {"id": "ship",     "label": "Lock in, ship the minimum that works, fix on Monday",    "weights": {"BUILDER": 3, "OPERATOR": 1}},
            {"id": "rally",    "label": "Get the team aligned and motivated for the push",        "weights": {"CONNECTOR": 3}},
            {"id": "triage",   "label": "Decide what to cut, what to keep, what to defend",       "weights": {"OPERATOR": 2, "GUARDIAN": 2}},
            {"id": "step_back","label": "Step back: is this the right thing to ship at all?",     "weights": {"INVENTOR": 2, "SYNTHESIZER": 2}},
        ],
    },
    {
        "id": "feedback_style",
        "prompt": "What kind of feedback actually lands for you?",
        "choices": [
            {"id": "specific", "label": "Specific: 'this line of code, this paragraph'",           "weights": {"BUILDER": 2, "GUARDIAN": 2}},
            {"id": "human",    "label": "Real talk in person, with context about why",            "weights": {"CONNECTOR": 3, "OPERATOR": 1}},
            {"id": "data",     "label": "The numbers, side-by-side comparison",                   "weights": {"SYNTHESIZER": 3, "OPERATOR": 1}},
            {"id": "vision",   "label": "Vision-level — 'here's what could be possible'",         "weights": {"INVENTOR": 3}},
        ],
    },
    {
        "id": "motivation",
        "prompt": "Five years from now, you'd be MOST proud if you...",
        "choices": [
            {"id": "shipped",  "label": "Shipped something millions of people use",               "weights": {"BUILDER": 3, "INVENTOR": 1}},
            {"id": "built_team","label": "Built a team or community people love being part of",   "weights": {"CONNECTOR": 3}},
            {"id": "discovery","label": "Discovered something true that nobody else had",         "weights": {"SYNTHESIZER": 3, "INVENTOR": 1}},
            {"id": "stable",   "label": "Built something steady that lasts a long time",          "weights": {"OPERATOR": 2, "GUARDIAN": 2}},
        ],
    },
    {
        "id": "frustration",
        "prompt": "What kind of work drains you fastest?",
        "choices": [
            {"id": "meetings", "label": "Endless meetings with no decisions",                     "weights": {"BUILDER": 2, "INVENTOR": 1}},
            {"id": "alone",    "label": "Working alone for days on something invisible",          "weights": {"CONNECTOR": 3}},
            {"id": "shallow",  "label": "Repeating the same shallow task with no insight",       "weights": {"SYNTHESIZER": 2, "INVENTOR": 2}},
            {"id": "sloppy",   "label": "Work that's sloppy or rushed past quality",             "weights": {"GUARDIAN": 3, "OPERATOR": 1}},
        ],
    },
    {
        "id": "ideal_day",
        "prompt": "Your ideal Tuesday at work looks like:",
        "choices": [
            {"id": "deep",     "label": "Three hours of deep focused making, alone",              "weights": {"BUILDER": 2, "SYNTHESIZER": 2}},
            {"id": "calls",    "label": "Five calls with interesting people, energy high",        "weights": {"CONNECTOR": 3}},
            {"id": "mixed",    "label": "Balanced — make in the morning, meet in the afternoon", "weights": {"OPERATOR": 2, "BUILDER": 1, "CONNECTOR": 1}},
            {"id": "exploring","label": "Wandering through new ideas, no fixed agenda",           "weights": {"INVENTOR": 3, "SYNTHESIZER": 1}},
        ],
    },
]


# Human-readable summary per archetype, used in the Profile fact value
# and shown to the user on the result screen.
ARCHETYPE_SUMMARIES: dict[str, dict[str, str]] = {
    "BUILDER": {
        "tagline": "You make things real.",
        "blurb": (
            "You're happiest with hands on the work. Specs are starting "
            "points, not contracts. You'd rather ship a v1 today than "
            "perfect v0 forever. Roles where this lands: founding "
            "engineer, design+build hybrids, early-stage anything."
        ),
    },
    "CONNECTOR": {
        "tagline": "You move through people.",
        "blurb": (
            "Energy comes from human contact. You read rooms, broker "
            "intros, and turn what's in someone's head into something "
            "the team can act on. Roles where this lands: PM, BD, sales "
            "engineering, partnerships, anywhere relationships drive "
            "outcomes."
        ),
    },
    "SYNTHESIZER": {
        "tagline": "You see the pattern others miss.",
        "blurb": (
            "Pull data from everywhere, find the through-line, write "
            "the one paragraph that actually explains it. Roles where "
            "this lands: research, strategy, data science, founder/CEO "
            "as the pattern-spotter on the team."
        ),
    },
    "OPERATOR": {
        "tagline": "You make the system work.",
        "blurb": (
            "Reliable, structured, the person who turns chaos into "
            "process. The team's productivity multiplier. Roles where "
            "this lands: ops, program management, COO-track, "
            "infrastructure engineering, anything where consistency "
            "compounds."
        ),
    },
    "INVENTOR": {
        "tagline": "You think years out.",
        "blurb": (
            "Vision-first, low patience for the present, allergic to "
            "incremental work. You see the version of this that "
            "doesn't exist yet. Roles where this lands: research, "
            "founder, principal-level IC, design at the strategy layer."
        ),
    },
    "GUARDIAN": {
        "tagline": "You catch what others miss.",
        "blurb": (
            "The bug, the ethical edge case, the assumption that's "
            "wrong, the thing nobody wants to think about. Trust comes "
            "naturally because correctness is the watermark you sign "
            "everything with. Roles where this lands: security, "
            "compliance, QA leadership, audit, ML safety, ops at scale."
        ),
    },
}


@router.get("/career-type/questions")
async def get_questions():
    """Return the 8 questions + choices. Static. Mobile renders the quiz
    locally and submits answers to /career-type/submit."""
    return {
        "questions": QUESTIONS,
        "archetypes": ARCHETYPE_SUMMARIES,
    }


@router.post("/career-type/submit")
async def submit_career_type(request: Request, body: dict = Body(...)):
    """Score the user's answers, write two facts to the Dilly Profile,
    save the archetype on the profile object so other features can read
    it. Returns the winning archetype + summary so mobile can show the
    result screen.

    Body: { answers: { question_id: choice_id, ... } }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    answers = body.get("answers")
    if not isinstance(answers, dict) or not answers:
        raise errors.validation_error("answers required (map of question_id -> choice_id)")

    # Score
    scores: dict[str, int] = {k: 0 for k in ARCHETYPE_SUMMARIES}
    chosen_labels: list[str] = []
    for q in QUESTIONS:
        choice_id = answers.get(q["id"])
        if not choice_id:
            continue
        choice = next((c for c in q["choices"] if c["id"] == choice_id), None)
        if not choice:
            continue
        chosen_labels.append(choice["label"])
        for archetype, w in (choice.get("weights") or {}).items():
            scores[archetype] = scores.get(archetype, 0) + int(w)

    # Pick top
    if not any(scores.values()):
        raise errors.validation_error("no valid answers found")
    winner = max(scores.items(), key=lambda kv: kv[1])[0]
    summary = ARCHETYPE_SUMMARIES.get(winner, {})

    # Persist on the profile object (other features read profile.career_archetype)
    try:
        from projects.dilly.api.profile_store import save_profile
        save_profile(email, {
            "career_archetype": winner,
            "career_archetype_taken_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "career_archetype_scores": scores,
        })
    except Exception:
        pass

    # Save TWO facts so the assessment also enriches the Memory tab
    try:
        from projects.dilly.api.memory_surface_store import save_memory_surface, get_memory_surface
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        new_facts = [
            {
                "id": str(uuid.uuid4()),
                "uid": email,
                "category": "personality",
                "label": f"Career Type: {winner}",
                "value": summary.get("tagline", winner),
                "source": "career_type_quiz",
                "created_at": now,
                "updated_at": now,
                "confidence": "high",
                "shown_to_user": False,
            },
            {
                "id": str(uuid.uuid4()),
                "uid": email,
                "category": "preference",
                "label": "Working style",
                "value": "; ".join(chosen_labels[:3])[:200] or "Not specified",
                "source": "career_type_quiz",
                "created_at": now,
                "updated_at": now,
                "confidence": "high",
                "shown_to_user": False,
            },
        ]
        save_memory_surface(email, items=new_facts)
    except Exception:
        pass

    return {
        "ok": True,
        "archetype": winner,
        "tagline": summary.get("tagline"),
        "blurb": summary.get("blurb"),
        "scores": scores,
        "facts_added": 2,
    }
