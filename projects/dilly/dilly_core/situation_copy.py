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


class HeroCard(TypedDict):
    # Per-path hero card shown above the default home content.
    # One concrete, path-specific moment the user can act on in 10s.
    eyebrow:          str     # small uppercase label on the card
    headline:         str     # 6-10 word sentence keyed to the cohort's moment
    body:             str     # 1-2 sentence context
    cta_label:        str     # text on the action button
    chat_seed:        str     # seeds Dilly chat when tapped


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

    # Per-path hero card shown at the top of the home screen. Each path
    # gets one concrete, cohort-specific action block. Null-able — if a
    # path doesn't warrant a hero card (e.g. 'exploring' and 'student'
    # already have rich default home content), we omit this.
    hero:             HeroCard | None


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
    "hero":            None,
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
        # Holder has its own bespoke home (HolderHome) — hero card
        # not rendered here.
        "hero":            None,
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
        "hero": {
            "eyebrow":   "FIRST MOVE",
            "headline":  "Name what you actually want.",
            "body":      "Before you open another job board, take 3 minutes to name the role you're hunting, not the one you'd accept.",
            "cta_label": "Figure it out with Dilly",
            "chat_seed": "I'm open to a few directions but I need to narrow down. Ask me 3 questions that will help me name the role I actually want, not the one I'd settle for.",
        },
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
        "hero": {
            "eyebrow":   "THIS WEEK",
            "headline":  "Stack one thing onto your profile this week.",
            "body":      "One class project, one side project, one workshop, one conversation. Doesn't have to be huge. Has to be added.",
            "cta_label": "Name it with Dilly",
            "chat_seed": "Help me pick ONE thing to add to my profile this week. Class, project, side work, whatever. Keep it small but real. Ask me what I've been working on.",
        },
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
        "hero": {
            "eyebrow":   "OPT CLOCK",
            "headline":  "Time left matters more than job count.",
            "body":      "Tell Dilly your OPT start date. Dilly stops pointing you at employers who don't sponsor and focuses on the ones who do.",
            "cta_label": "Set your OPT date",
            "chat_seed": "I'm on F-1 OPT. Ask me my OPT start date and degree level so you can keep my feed focused on employers who sponsor. Be direct about the clock.",
        },
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
        "hero": {
            "eyebrow":   "SHOW YOUR WORK",
            "headline":  "Name the one project you'd show a stranger.",
            "body":      "Without a degree, a single killer project is your unfair advantage. Tell Dilly about it once and every resume Dilly writes leads with it.",
            "cta_label": "Name your project",
            "chat_seed": "I don't have a traditional degree. Help me pick the single strongest project I've shipped and figure out how to frame it so it's the first thing a recruiter sees. Ask me what I've built.",
        },
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
        # senior_reset has its own bespoke home (SeniorResetHome).
        "hero":            None,
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
        "hero": {
            "eyebrow":   "BRIDGE THE FIELDS",
            "headline":  "Pick the ONE old-field skill that wins the new one.",
            "body":      "Every pivot has a single transferable that does the heavy lifting. For teachers moving into tech, it's often curriculum design. For analysts moving to product, it's stakeholder synthesis.",
            "cta_label": "Find yours with Dilly",
            "chat_seed": "I'm pivoting careers. Help me name the ONE strongest transferable skill from my old field that will make my new-field resume stand out. Ask me about the last big project I owned and why it worked.",
        },
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
        "hero": {
            "eyebrow":   "UNWRITTEN RULE",
            "headline":  "One rule today that nobody told you.",
            "body":      "Every day Dilly surfaces one thing about college-to-career that people with connected families learned at the dinner table. Not fluff. Concrete.",
            "cta_label": "Hear today's rule",
            "chat_seed": "Teach me one unwritten rule about college-to-career that first-gen students usually miss. Something concrete I can use this week. Not vague advice.",
        },
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
        "hero": {
            "eyebrow":   "REFRAME THE GAP",
            "headline":  "Turn your career break into a resume line.",
            "body":      "Family Leadership, 2018 to 2024. Operations at home. Real skills. No apology, no blank space. Dilly writes it with you.",
            "cta_label": "Write the entry",
            "chat_seed": "I'm returning to work after a break to raise kids. Help me write a single strong Family Leadership entry for my resume. Ask me what I actually ran during the break: budgets, logistics, scheduling, conflict resolution, people I coordinated.",
        },
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
        "hero": {
            "eyebrow":   "MOS TRANSLATOR",
            "headline":  "Turn your MOS into what recruiters read.",
            "body":      "11B, E-5, squad leader means nothing to HR at a bank. It means a lot when translated. Tell Dilly your MOS and Dilly maps it to civilian titles and skills that land.",
            "cta_label": "Translate your MOS",
            "chat_seed": "I'm a veteran transitioning to civilian work. My MOS is [ask me] and my rank was [ask me]. Translate those into civilian job titles, skill language, and the kinds of roles that hire for it. Be specific.",
        },
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
        "hero": {
            "eyebrow":   "TRANSLATE ONE",
            "headline":  "One trade skill, rewritten for an office.",
            "body":      "\"Read blueprints\" becomes \"interpreted technical specifications.\" \"Managed a crew\" becomes \"led a team in a regulated environment.\" Dilly does one translation with you today.",
            "cta_label": "Start translating",
            "chat_seed": "I'm moving from skilled trades into office work. Pick one thing I did regularly in my trade job and help me translate it into office-ready language for my resume. Start by asking me what I did day-to-day on the job.",
        },
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
        "hero": {
            "eyebrow":   "YOU OWN THE STORY",
            "headline":  "The disclosure playbook, in plain English.",
            "body":      "When to say something, what to say, what the law says, what the best fair-chance employers actually want to hear. No legal fog. Just what to do at each step.",
            "cta_label": "Walk me through it",
            "chat_seed": "I'm a returning citizen. Walk me through the disclosure playbook step by step: when (pre-application, interview, offer, after), how to say it without over-apologizing, and what to do when the application asks directly. Direct, concrete, no legal haze.",
        },
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
        "hero": {
            "eyebrow":   "LITERAL SCRIPTS",
            "headline":  "An interview script you can rehearse.",
            "body":      "Pick a question. Dilly gives you a full literal answer with reasoning. You adapt. You rehearse. You walk in ready.",
            "cta_label": "Build a script",
            "chat_seed": "Give me a literal script for a common behavioral interview question. Include the full answer, my reasoning, and tell me which parts to adapt with my own examples. No metaphors. Direct and concrete.",
        },
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
        "hero": {
            "eyebrow":   "ACCOMMODATION",
            "headline":  "Request an accommodation that works for you.",
            "body":      "Dilly drafts the specific accommodation request you want. The law covers interview accommodations too. You don't have to improvise this conversation.",
            "cta_label": "Draft with Dilly",
            "chat_seed": "I want to request an interview accommodation. Help me draft a clear, short email to the recruiter. The accommodation I need is [ask me]. Keep it direct and grounded in what the law supports.",
        },
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
        "hero": {
            "eyebrow":   "TRANSLATE YOUR STORY",
            "headline":  "One job from home, rewritten for US recruiters.",
            "body":      "Title differences, degree equivalence, company context: Dilly bridges all three. Start with one job. Build the full resume from there.",
            "cta_label": "Translate one job",
            "chat_seed": "I worked in [ask me which country] before coming to the US. Take my most recent job there and help me write it on a US resume so the title, the company, and the achievements are all legible to a US recruiter.",
        },
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
        "hero": {
            "eyebrow":   "OPERATOR DNA",
            "headline":  "Frame the founder years as a W-2 resume.",
            "body":      "Bootstrapped, hired, fired, shipped, sold. That's a real job. Dilly helps you write it like one so recruiters read it as experience, not a side quest.",
            "cta_label": "Write it with Dilly",
            "chat_seed": "I ran my own thing. Help me write the founder years as a single resume entry that reads like real work experience: title, company, scope, outcomes. Ask me for numbers: team size, revenue, users, whatever I have.",
        },
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
        "hero": {
            "eyebrow":   "READ THE CULTURE",
            "headline":  "Spot the employers who walk it.",
            "body":      "Beyond HRC score, Dilly reads benefits pages, leadership diversity, and pride-month-was-last-year signals. You get a read on the real culture, not the press release.",
            "cta_label": "Read one employer",
            "chat_seed": "Help me read the real culture at [ask me which employer I'm looking at]. Go beyond the HRC score: benefits, policies, leadership, employee reviews on LGBTQ issues. Tell me what you'd tell a friend.",
        },
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
        "hero": {
            "eyebrow":   "ASYNC SIGNAL",
            "headline":  "Spot the real remote-first companies.",
            "body":      "Remote-friendly and remote-first are not the same. Dilly flags the tell-tale signs (async docs culture, distributed leadership, no 'hubs') so you don't take a job that drags you to Seattle in six months.",
            "cta_label": "Vet an employer",
            "chat_seed": "Help me read whether [ask me the company] is really remote-first or just remote-tolerant. Look for async culture signals, distributed leadership, no-hub hiring, and how they handle meetings. Give me the honest read.",
        },
    },
}


def copy_for_path(user_path: str | None) -> SituationCopy:
    """Return the copy set for a user_path, falling back to default."""
    if not user_path:
        return _DEFAULT
    key = str(user_path).strip().lower()
    return SITUATION_COPY.get(key, _DEFAULT)
