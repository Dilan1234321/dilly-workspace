"""
Per-situation copy for the Dilly app.

Every user picks a situation in onboarding (choose-situation.tsx). That
path should shape not just which specialized features they see, but the
*voice* of the app across every shared surface. A parent returning to
work should not see "Welcome back!" in exclamation-heavy cheerleader
tone; an international grad should see language that acknowledges visa
stress without making it the whole identity.

This module defines a copy set per user_path. Frontend reads the set
via the /profile response and substitutes the strings into shared
surfaces.

Principles:
  - Never make the path their whole identity. Acknowledge, don't label.
  - No exclamation marks in greetings. Calm energy scales; chirpy
    energy reads as dismissive to people in hard moments.
  - Concrete, specific actions over generic encouragement.
  - {first_name} is the ONLY template variable. Keep it simple.

Zero cost: pure Python dict, deterministic lookup, no LLM anywhere.
"""
from __future__ import annotations
from typing import TypedDict


class SituationCopy(TypedDict):
    # First tab / home screen
    eyebrow:          str   # small uppercase label above greeting
    greeting:         str   # main line, may include {first_name}
    subtext:          str   # one sentence under the greeting

    # Chat opening / talk CTA
    talk_cta:         str   # label on "Talk to Dilly" buttons
    empty_chat_seed:  str   # what Dilly says when the user first opens chat

    # Empty states
    empty_jobs:       str   # when the jobs feed is loading / empty
    empty_facts:      str   # when Dilly doesn't know much yet

    # Accent color (hex) for eyebrow + small accents on shared surfaces
    accent:           str


# Default copy used for any path that doesn't have a specific entry.
# Designed as generic, competent seeker voice.
_DEFAULT: SituationCopy = {
    "eyebrow":         "TODAY",
    "greeting":        "{first_name}, let's take a look.",
    "subtext":         "Here's what changed since last time.",
    "talk_cta":        "Talk to Dilly",
    "empty_chat_seed": "What do you want to work on?",
    "empty_jobs":      "Still loading the feed.",
    "empty_facts":     "Tell Dilly more and this page gets sharper.",
    "accent":          "#4F46E5",
}


SITUATION_COPY: dict[str, SituationCopy] = {
    # ─── Holder: have a job, want to stay ahead ─────────────────
    "i_have_a_job": {
        "eyebrow":         "CAREER WATCH",
        "greeting":        "Welcome back, {first_name}.",
        "subtext":         "Here's what your field is doing this week.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "What's on your mind at work?",
        "empty_jobs":      "Loading market read for your role.",
        "empty_facts":     "Dilly's still learning your field. Ask anything.",
        "accent":          "#1B3FA0",
    },

    # ─── Exploring: actively looking, open mind ─────────────────
    "exploring": {
        "eyebrow":         "OPEN MARKET",
        "greeting":        "{first_name}, here's where things stand.",
        "subtext":         "Fresh jobs, fit narratives, and one move to make today.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me sort through what I actually want next.",
        "empty_jobs":      "Pulling your feed. Give it a second.",
        "empty_facts":     "Tell Dilly more about what you've done. Fits get sharper.",
        "accent":          "#7C3AED",
    },

    # ─── Student: college, looking for internships / first role ─
    "student": {
        "eyebrow":         "THIS WEEK AT SCHOOL",
        "greeting":        "Hey {first_name}, ready to move.",
        "subtext":         "Internships matched to your major. One thing to do today.",
        "talk_cta":        "Chat with Dilly",
        "empty_chat_seed": "What should I be working on this week?",
        "empty_jobs":      "Loading internships for your cohort.",
        "empty_facts":     "Tell Dilly about a project, a class, anything you've built.",
        "accent":          "#4F46E5",
    },

    # ─── International grad: F-1/OPT, needs sponsorship ─────────
    # Low-key on the visa framing. The user already lives with it;
    # we don't need to put it at the top of their screen every day.
    "international_grad": {
        "eyebrow":         "SPONSOR-READY",
        "greeting":        "{first_name}, let's keep moving.",
        "subtext":         "Filtered to employers who've sponsored. No guesswork.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me think through my OPT timing and what to prioritize.",
        "empty_jobs":      "Filtering for sponsorship history.",
        "empty_facts":     "The more Dilly knows, the better the visa-ready matches.",
        "accent":          "#0EA5E9",
    },

    # ─── Dropout: self-taught, bootcamp, no degree ──────────────
    "dropout": {
        "eyebrow":         "THE WORK SPEAKS",
        "greeting":        "{first_name}, what you've built is enough.",
        "subtext":         "No-degree-required roles, filtered for you.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me name what I've actually built and how to frame it.",
        "empty_jobs":      "Pulling degree-optional roles.",
        "empty_facts":     "Tell Dilly about a project you shipped. That's your proof.",
        "accent":          "#059669",
    },

    # ─── Senior reset: laid off after years ─────────────────────
    # Kept in sync with SeniorResetHome so the shared strings match.
    "senior_reset": {
        "eyebrow":         "YOUR RESET",
        "greeting":        "{first_name}, here's where you are today.",
        "subtext":         "Slow is fine. Dilly doesn't push.",
        "talk_cta":        "Talk it through",
        "empty_chat_seed": "Help me sketch a realistic plan. I want honesty, not hype.",
        "empty_jobs":      "Filtering for senior roles in your field.",
        "empty_facts":     "Dilly is still learning what you built. Start anywhere.",
        "accent":          "#0F766E",
    },

    # ─── Career switch: experience in one field, pivoting ───────
    "career_switch": {
        "eyebrow":         "THE PIVOT",
        "greeting":        "{first_name}, you're already doing the work.",
        "subtext":         "Transferable skills pulled up, gaps named honestly.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me translate what I did before into the field I'm moving into.",
        "empty_jobs":      "Loading roles in your target field.",
        "empty_facts":     "Tell Dilly about your old field. Nothing is wasted.",
        "accent":          "#0891B2",
    },

    # ─── First-gen college: mentor gap ──────────────────────────
    "first_gen_college": {
        "eyebrow":         "YOUR PLAYBOOK",
        "greeting":        "{first_name}, here's what to actually do.",
        "subtext":         "The unwritten rules, written out. No mystery.",
        "talk_cta":        "Ask Dilly",
        "empty_chat_seed": "Tell me a rule nobody at home ever told me.",
        "empty_jobs":      "Loading internships matched to you.",
        "empty_facts":     "The work-to-pay-tuition jobs count. Tell Dilly.",
        "accent":          "#F59E0B",
    },

    # ─── Parent returning: 2+ year gap ──────────────────────────
    "parent_returning": {
        "eyebrow":         "COMING BACK",
        "greeting":        "{first_name}, welcome back on your terms.",
        "subtext":         "Flex-friendly employers. The gap gets reframed, not apologized for.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me write my Family Leadership entry for the resume.",
        "empty_jobs":      "Filtering for flex, remote, and return-to-work programs.",
        "empty_facts":     "Parenting is project management. Tell Dilly what you ran at home.",
        "accent":          "#EA580C",
    },

    # ─── Veteran: transitioning from service ────────────────────
    "veteran": {
        "eyebrow":         "TRANSITION",
        "greeting":        "{first_name}, let's translate.",
        "subtext":         "MOS codes into civilian titles. Clearances surfaced.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Translate 'squad leader' into what civilian recruiters read.",
        "empty_jobs":      "Loading veteran-friendly roles.",
        "empty_facts":     "Tell Dilly your MOS and Dilly maps it to job titles.",
        "accent":          "#15803D",
    },

    # ─── Trades to white collar ─────────────────────────────────
    "trades_to_white_collar": {
        "eyebrow":         "CROSSOVER",
        "greeting":        "{first_name}, the fundamentals move with you.",
        "subtext":         "Trade experience reframed. Certs surfaced as real credentials.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me turn 'read blueprints' into office-ready resume language.",
        "empty_jobs":      "Loading office roles that value hands-on work.",
        "empty_facts":     "Your OSHA card and trade certs count. Tell Dilly.",
        "accent":          "#B45309",
    },

    # ─── Formerly incarcerated ──────────────────────────────────
    "formerly_incarcerated": {
        "eyebrow":         "THIS CHAPTER",
        "greeting":        "{first_name}, new page.",
        "subtext":         "Fair-chance employers. Year-only dates. Nothing hidden, nothing flagged.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "What do I disclose and when? Walk me through it honestly.",
        "empty_jobs":      "Filtering for fair-chance employers.",
        "empty_facts":     "Certs earned inside are real credentials. Tell Dilly.",
        "accent":          "#7C2D12",
    },

    # ─── Neurodivergent ─────────────────────────────────────────
    # Direct, concrete, no metaphors.
    "neurodivergent": {
        "eyebrow":         "TODAY",
        "greeting":        "{first_name}. Here is what to do.",
        "subtext":         "Direct and specific. No small talk.",
        "talk_cta":        "Ask Dilly",
        "empty_chat_seed": "Give me a script for an interview I have this week.",
        "empty_jobs":      "Loading the feed.",
        "empty_facts":     "Tell Dilly one skill. Then another. Keep it specific.",
        "accent":          "#6366F1",
    },

    # ─── Disabled professional ──────────────────────────────────
    "disabled_professional": {
        "eyebrow":         "THE WORK",
        "greeting":        "{first_name}, let's focus on the work.",
        "subtext":         "Inclusion-certified employers. Accommodation info when you ask.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Walk me through disclosure. When, to whom, how much.",
        "empty_jobs":      "Filtering for disability-inclusive employers.",
        "empty_facts":     "Tell Dilly what you do best. That's what leads.",
        "accent":          "#6366F1",
    },

    # ─── Refugee / new to US ────────────────────────────────────
    "refugee": {
        "eyebrow":         "NEW CHAPTER",
        "greeting":        "{first_name}, welcome.",
        "subtext":         "Dilly translates prior experience into US workplace language.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "I worked in my home country. Help me translate that into a US resume.",
        "empty_jobs":      "Filtering for refugee-friendly employers.",
        "empty_facts":     "Prior experience counts. Tell Dilly about it.",
        "accent":          "#0E7490",
    },

    # ─── Ex-founder ─────────────────────────────────────────────
    "ex_founder": {
        "eyebrow":         "BACK IN",
        "greeting":        "{first_name}, operator mode.",
        "subtext":         "Companies that value founder DNA. Framings that don't apologize for the path.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me reframe founder work so big companies don't see 'flight risk.'",
        "empty_jobs":      "Loading roles that want operators.",
        "empty_facts":     "Tell Dilly what you shipped. Numbers matter.",
        "accent":          "#CA8A04",
    },

    # ─── LGBTQ ──────────────────────────────────────────────────
    "lgbtq": {
        "eyebrow":         "TODAY",
        "greeting":        "{first_name}, here's where things are.",
        "subtext":         "Inclusive employers pinned. Pronouns respected.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me plan my next move.",
        "empty_jobs":      "Filtering for inclusive employers.",
        "empty_facts":     "Tell Dilly what you've built. That's what leads.",
        "accent":          "#BE185D",
    },

    # ─── Rural / remote-only ────────────────────────────────────
    "rural_remote_only": {
        "eyebrow":         "REMOTE MARKET",
        "greeting":        "{first_name}, remote only. Got it.",
        "subtext":         "Every job in your feed is remote. No bait-and-switch hybrid.",
        "talk_cta":        "Talk to Dilly",
        "empty_chat_seed": "Help me find remote employers who won't drag me into an office.",
        "empty_jobs":      "Loading remote-only roles.",
        "empty_facts":     "Tell Dilly the tools you've used remotely. Matches get sharper.",
        "accent":          "#0891B2",
    },
}


def copy_for_path(user_path: str | None) -> SituationCopy:
    """Return the copy set for a user_path, falling back to default."""
    if not user_path:
        return _DEFAULT
    key = str(user_path).strip().lower()
    return SITUATION_COPY.get(key, _DEFAULT)
