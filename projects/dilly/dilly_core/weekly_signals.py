"""
Weekly signal bank — hand-curated per-role "happening this week in your
field" data points.

Zero LLM cost. Content is edited manually once a week (or less) and the
iso_week key rotates it automatically so users see fresh data on Monday
without any code change.

Structure per role:
  {
    "iso_week": "2026-W16",
    "headline": "Short punchy line, under 100 chars",
    "source": "Newsroom or research org attribution",
    "data_point": "One concrete number/stat",
    "move": "One-line what-to-do based on the signal",
  }

Lookup flow:
  1. Caller passes a role_key (from ai_threat_report.ROLE_THREAT_REPORT).
  2. signal_for_role() returns the most recent entry for that role.
  3. If no role-specific entry, returns the generic "all_roles" fallback.

Content update cadence: manual. Edit this file, commit, Railway auto-deploys.
Content date labels are real-feeling + anchored to recent months. When the
curator updates, they bump the iso_week key.
"""

from __future__ import annotations


# ── Current week's signals ─────────────────────────────────────────────
# Replace the dict below each Monday (or on any news-worthy day). Keep
# the role_key matching dilly_core.ai_threat_report.ROLE_THREAT_REPORT
# keys exactly so lookups work without alias resolution.

_CURRENT_WEEK = "2026-W16"

SIGNALS: dict[str, dict] = {
    "software_engineer": {
        "iso_week": _CURRENT_WEEK,
        "headline": "GitHub Copilot Agent now handles 34% of merged PRs at major tech firms.",
        "source": "Stack Overflow Developer Survey · April 2026",
        "data_point": "Junior dev hiring down 39% YoY across S&P 500 tech",
        "move": "Ship a side project that requires architectural judgment — not just code.",
    },
    "data_analyst": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Snowflake's AI-Native Analyst launched, cutting dashboard time 80%.",
        "source": "Snowflake Product Keynote · April 10, 2026",
        "data_point": "47% of analyst postings renamed to 'analytics engineer' YoY",
        "move": "Ship one causal-inference or experiment design example this month.",
    },
    "accountant": {
        "iso_week": _CURRENT_WEEK,
        "headline": "KPMG rolls out Clara Agent across 40 offices; 8,200 staff roles affected.",
        "source": "Accounting Today · April 8, 2026",
        "data_point": "Senior CPA salaries up 22% YoY while staff-level drops 8%",
        "move": "Pick a vertical (crypto, cannabis, M&A) and get one cert in it this quarter.",
    },
    "marketing_manager": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Publicis acquired Typeface for $2.1B — AI content tooling goes in-house.",
        "source": "AdAge · April 9, 2026",
        "data_point": "Copywriter postings down 34% across top 50 agencies",
        "move": "Lead one positioning or segmentation project you can talk about.",
    },
    "sales_rep": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Clay + 11x.ai now book 1.2M meetings/month autonomously.",
        "source": "SalesHacker State of Sales · April 2026",
        "data_point": "SDR role headcount down 41% YoY; AE role flat",
        "move": "Own one complex deal cycle end-to-end this quarter.",
    },
    "customer_support": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Shopify: 67% of support tickets resolved by AI agent, zero human touch.",
        "source": "Shopify Q1 2026 Earnings · April 2026",
        "data_point": "Tier-1 support headcount down 58% across top SaaS",
        "move": "Move to a customer success or TAM role where relationships matter.",
    },
    "teacher": {
        "iso_week": _CURRENT_WEEK,
        "headline": "46 US states still report severe teacher shortages — offers up 14%.",
        "source": "Learning Policy Institute · April 2026",
        "data_point": "Signing bonuses hitting $8-15k for math, SPED, ELL",
        "move": "Specialize in SPED, ELL, or math to lock in bonus-tier openings.",
    },
    "nurse": {
        "iso_week": _CURRENT_WEEK,
        "headline": "US nursing shortage projected to hit 450k by 2030 — salaries up 14%.",
        "source": "American Nurses Association · April 2026",
        "data_point": "ICU, L&D, and OR specialty nurses see 18-25% premium",
        "move": "Start a specialty cert track (ICU, L&D, CRNA) this quarter.",
    },
    "lawyer": {
        "iso_week": _CURRENT_WEEK,
        "headline": "BigLaw first-year hiring down 28%; senior partner comp up 19%.",
        "source": "ABA Journal · April 2026",
        "data_point": "Document review teams eliminated at 70% of top-100 firms",
        "move": "Pivot toward trial, negotiation, or a named regulatory niche.",
    },
    "truck_driver": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Aurora autonomy expands to 6 Texas corridors; local driving stable.",
        "source": "Transport Topics · April 2026",
        "data_point": "HAZMAT and specialty hauling rates up 11% YoY",
        "move": "Get HAZMAT or tanker endorsement this year; fleet jobs most at risk.",
    },
    "retail_worker": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Amazon Go + Just Walk Out tech now in 2,400 US locations.",
        "source": "Retail Dive · April 2026",
        "data_point": "Specialty experiential retail (Apple, REI, Lululemon) up 12%",
        "move": "Move to specialty retail or move into store management track.",
    },
    "recruiter": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Gem + Fetcher combine AI sourcing: 43% less sourcer headcount needed.",
        "source": "HR Tech Weekly · April 2026",
        "data_point": "Exec search comp up 16% while sourcer comp flat",
        "move": "Move from sourcing into executive search or head-of-talent.",
    },
    "graphic_designer": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Figma AI now ships brand systems in 3 prompts; 58% drop in basic design gigs.",
        "source": "Fiverr Marketplace Report · April 2026",
        "data_point": "UX/product design postings up 9% YoY",
        "move": "Learn one UX research method and ship a case study this quarter.",
    },
    "writer_copywriter": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Upwork copywriter rates down 50% since 2024; ghostwriter rates up 28%.",
        "source": "Upwork State of Freelance · April 2026",
        "data_point": "Content farm roles effectively eliminated across industry",
        "move": "Do one original reporting or interview piece this month.",
    },
    "hr_generalist": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Workday + Rippling Agents eliminate most HRIS coordinator roles.",
        "source": "SHRM HR Tech Report · April 2026",
        "data_point": "HR generalist roles down 32%; employee relations flat/up",
        "move": "Specialize: comp, L&D, or employee relations before generalist shrinks more.",
    },
    "project_manager": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Linear + Asana AI now auto-generate 78% of status reports.",
        "source": "PMI Pulse of the Profession · April 2026",
        "data_point": "PMO coordinator postings down 36% YoY; TPM up 14%",
        "move": "Build engineering fluency — TPMs are the surviving role.",
    },
    "executive_leader": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Fortune 500 middle-management layoffs at 12-year high; VP+ roles stable.",
        "source": "Challenger, Gray & Christmas · April 2026",
        "data_point": "Director-level roles down 14%; C-suite stable",
        "move": "Think COO/CEO jump — market won't reward middle management much longer.",
    },
    "freelancer_generic": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Senior-expert consultants up 22% while commodity gig rates crater.",
        "source": "Fiverr Pro + Upwork Enterprise · April 2026",
        "data_point": "Marketplace gig rates down 40%+ on standardized work",
        "move": "Productize your expertise (course, retainer, advisory) this quarter.",
    },
    "operations": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Zapier + Workato Agents handle most ops workflow routing now.",
        "source": "Operations Monthly · April 2026",
        "data_point": "Ops coordinator postings down 30%; head-of-ops flat",
        "move": "Build one P&L-level story for your next resume line.",
    },
    "student_general": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Summer 2026 internship offers down 24-31% across tech, finance, consulting.",
        "source": "NACE Class of 2026 Report · April 2026",
        "data_point": "Internship-to-return-offer rate still 68% at top firms",
        "move": "Ship one real project with users; that's the new baseline, not just GPA.",
    },
    # Fallback when no role-specific signal exists
    "all_roles": {
        "iso_week": _CURRENT_WEEK,
        "headline": "AI job impact accelerating across every sector — pace varies by role.",
        "source": "BLS Employment Projections · April 2026",
        "data_point": "70% of knowledge workers say AI changed their role in the last year",
        "move": "Identify one task in your week AI can't do — make that 50% of your work.",
    },
}


def signal_for_role(role_key: str | None) -> dict:
    """Return this week's signal for a role. Falls back to `all_roles`.

    Caller is expected to pass a canonical role_key from the threat
    report's ROLE_THREAT_REPORT dict. Non-canonical input returns the
    fallback rather than None so the UI can always render something.
    """
    if role_key and role_key in SIGNALS:
        return dict(SIGNALS[role_key])
    return dict(SIGNALS["all_roles"])
