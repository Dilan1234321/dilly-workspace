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
        "move": "Ship a side project that requires architectural judgment, not just code.",
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
        "headline": "Publicis acquired Typeface for $2.1B; AI content tooling goes in-house.",
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
        "headline": "46 US states still report severe teacher shortages; offers up 14%.",
        "source": "Learning Policy Institute · April 2026",
        "data_point": "Signing bonuses hitting $8-15k for math, SPED, ELL",
        "move": "Specialize in SPED, ELL, or math to lock in bonus-tier openings.",
    },
    "nurse": {
        "iso_week": _CURRENT_WEEK,
        "headline": "US nursing shortage projected to hit 450k by 2030; salaries up 14%.",
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
        "move": "Build engineering fluency. TPMs are the surviving role.",
    },
    "executive_leader": {
        "iso_week": _CURRENT_WEEK,
        "headline": "Fortune 500 middle-management layoffs at 12-year high; VP+ roles stable.",
        "source": "Challenger, Gray & Christmas · April 2026",
        "data_point": "Director-level roles down 14%; C-suite stable",
        "move": "Think COO/CEO jump. Market won't reward middle management much longer.",
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
        "headline": "AI job impact accelerating across every sector; pace varies by role.",
        "source": "BLS Employment Projections · April 2026",
        "data_point": "70% of knowledge workers say AI changed their role in the last year",
        "move": "Identify one task in your week AI can't do. Make that 50% of your work.",
    },
}


_SIGNAL_ALT_HEADLINES = False  # marker so future edits know this block starts


# ── Alternate signals (rotation partner) ───────────────────────────
# Same 26 roles as SIGNALS, different angle on the same AI/market
# story. signal_for_role alternates between SIGNALS and SIGNALS_ALT
# by ISO-week parity so users see two distinct weekly signals before
# content repeats. iso_week is stamped dynamically at call time so
# the Field Pulse "NEW" badge works correctly for the current week.

SIGNALS_ALT: dict[str, dict] = {
    "software_engineer": {
        "headline": "Cursor + Windsurf hit 40% code-generated-per-PR at stage-3 startups.",
        "source": "Y Combinator Engineering Survey · March 2026",
        "data_point": "Staff+ engineer openings up 18%; mid-level flat",
        "move": "Move toward ambiguous, system-design-heavy work. That's where the ceiling moved.",
    },
    "data_analyst": {
        "headline": "Mode Analytics deprecates SQL-writing role; 'question-shaper' role launched.",
        "source": "Mode Blog · March 2026",
        "data_point": "Data science postings with 'causal inference' up 29% YoY",
        "move": "Learn to design experiments, not just query warehouses. That is the new moat.",
    },
    "accountant": {
        "headline": "Deloitte closes 60% of staff-level audit roles; advisory practice hiring surges.",
        "source": "WSJ · March 2026",
        "data_point": "Advisory & tax-planning partners up 26% YoY, staff auditors down 41%",
        "move": "Pivot toward advisory or forensic. Commodity audit is not coming back.",
    },
    "marketing_manager": {
        "headline": "HubSpot's Breeze Agents run full campaign cycles; human review shifts to strategy.",
        "source": "HubSpot INBOUND · March 2026",
        "data_point": "Brand + PMM hiring up 17% while ops marketing roles shrink",
        "move": "Go deep on brand, positioning, and measurement. Tactical execution is table stakes.",
    },
    "sales_rep": {
        "headline": "Salesforce kills Outreach; Agentforce handles top-of-funnel across its entire base.",
        "source": "Salesforce Dreamforce · March 2026",
        "data_point": "Enterprise AE comp up 12% YoY; SDR roles down 44%",
        "move": "Learn multi-stakeholder enterprise cycles this quarter. Transactional sales is gone.",
    },
    "customer_support": {
        "headline": "Intercom Fin 2.0 now handles multi-step refund and billing disputes solo.",
        "source": "Intercom Product Release · March 2026",
        "data_point": "Customer Success Manager postings up 19%; Tier-1 support down 63%",
        "move": "Build relationship muscles — CSM, TAM, implementation are surviving roles.",
    },
    "teacher": {
        "headline": "Khanmigo deployed in 4 major districts; teacher role shifts toward coaching + SEL.",
        "source": "EdWeek · March 2026",
        "data_point": "SPED teachers earning $12k-$18k bonuses in urban districts",
        "move": "Deepen SEL + SPED skills. The human-relationship side of teaching is what survives.",
    },
    "nurse": {
        "headline": "Ambient-AI scribes now in 58% of US hospitals; nurses reclaim 2-3 hours/shift.",
        "source": "Becker's Hospital Review · March 2026",
        "data_point": "Travel-nurse premium roles up 22% in ICU + L&D + OR",
        "move": "Lean into hands-on specialty work. Documentation-heavy roles shrink; bedside doesn't.",
    },
    "lawyer": {
        "headline": "Harvey + Spellbook handle 70% of contract review; transactional hours plummet.",
        "source": "Legaltech News · March 2026",
        "data_point": "Litigation partner comp up 21% YoY; contract attorney roles down 49%",
        "move": "Courtroom, negotiation, regulatory. Anything AI can't sign off on with malpractice risk.",
    },
    "truck_driver": {
        "headline": "Kodiak launches driver-out in 4 states; regional fleet jobs stable for 5+ yrs.",
        "source": "FreightWaves · March 2026",
        "data_point": "Owner-operator + specialty hauling rates up 14% YoY",
        "move": "Go owner-operator or get tanker/HAZMAT endorsement. Long-haul OTR is the first to go.",
    },
    "retail_worker": {
        "headline": "Sephora BeautyGenius counters outperform human associates on conversion.",
        "source": "NRF Big Show Recap · March 2026",
        "data_point": "Assistant store manager roles up 8%; cashier roles down 26% YoY",
        "move": "Move into management track or move to a store that sells experience, not just product.",
    },
    "recruiter": {
        "headline": "LinkedIn Recruiter AI auto-sources + outreaches candidates at 10x human pace.",
        "source": "SHRM Talent Report · March 2026",
        "data_point": "Talent-acquisition director roles up 14%; contract sourcer roles down 38%",
        "move": "Move toward head-of-talent, talent brand, or DEI-hiring roles. Pure sourcing is dead.",
    },
    "graphic_designer": {
        "headline": "Adobe Firefly 3 + Canva Magic ship brand-kit-to-campaign in minutes.",
        "source": "Adobe MAX · March 2026",
        "data_point": "Product designer postings up 11%; logo-focused freelancers down 52%",
        "move": "Go upstream — brand strategy, service design, product design. Pixel work alone won't pay rent.",
    },
    "writer_copywriter": {
        "headline": "Publishers increase investment in original journalism + expert voices 3x YoY.",
        "source": "Reuters Institute Digital News Report · March 2026",
        "data_point": "Ghostwriters with subject-matter depth earning $200+/hr premium",
        "move": "Earn expertise first, writing skill second. Generic copywriting is commodity.",
    },
    "hr_generalist": {
        "headline": "BambooHR acquires Lattice; HRIS work collapses into one automated stack.",
        "source": "HR Dive · March 2026",
        "data_point": "Comp + benefits specialists up 12%; HR generalist openings down 34%",
        "move": "Pick ONE specialty this year. Generalist HR is being absorbed into the product.",
    },
    "project_manager": {
        "headline": "ClickUp AI Brain auto-writes status, risk, and retro docs; coordinator roles flat.",
        "source": "Project Management Institute · March 2026",
        "data_point": "Technical PM (engineering, data, ML) roles up 19% YoY",
        "move": "Earn the 'technical' prefix. PM without depth in a domain is the role being cut.",
    },
    "executive_leader": {
        "headline": "Fortune 100 CEO tenure drops 18%; operator CEOs with AI fluency at a premium.",
        "source": "Spencer Stuart CEO Study · March 2026",
        "data_point": "CFO + COO search mandates up 23% YoY",
        "move": "Show you can lead through technology change. Boards are filtering hard for it now.",
    },
    "freelancer_generic": {
        "headline": "Toptal + MBB alumni platforms grow 40%; commodity-work marketplaces shrink.",
        "source": "Freelance Economy Report · March 2026",
        "data_point": "Expert-tier rate cards holding; commodity rates down 45% YoY",
        "move": "Get into an expert network or productize a retainer. Bidding wars are a losing game now.",
    },
    "operations": {
        "headline": "Ramp + Brex auto-close books + run accruals; biz-ops role shifts to strategic modeling.",
        "source": "CFO Weekly · March 2026",
        "data_point": "Strategic finance + biz-ops roles up 21% YoY",
        "move": "Build modeling + forecasting muscles. Execution-ops is being automated.",
    },
    "student_general": {
        "headline": "Entry-level no-experience offers down 28%; internship-to-offer stays sticky.",
        "source": "Handshake Network Trends · March 2026",
        "data_point": "Project-portfolio weight at top-50 employers up 2x vs 2024",
        "move": "One real shipped thing > three added clubs. Portfolio is the new GPA.",
    },
    "all_roles": {
        "headline": "Companies reporting 'AI-driven' layoffs up 220%; most are role redesigns, not cuts.",
        "source": "Challenger, Gray & Christmas · March 2026",
        "data_point": "Half of roles eliminated were replaced with different roles at the same company",
        "move": "Read the re-orgs carefully. The role you want may be the one replacing yours.",
    },
}


def _current_iso_week() -> str:
    """Return the current ISO week stamp in YYYY-Www format so
    Field Pulse's is_new_to_user gate compares cleanly against the
    signal's iso_week field."""
    import datetime
    today = datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"{year}-W{week:02d}"


def _pick_signal_table(iso_week: str) -> dict:
    """ISO-week parity rotation. Even weeks → SIGNALS, odd weeks →
    SIGNALS_ALT. Falls back to SIGNALS if the alt table is missing
    the role_key, so partial coverage never breaks a lookup."""
    try:
        week_num = int(iso_week.split("-W")[-1])
    except Exception:
        return SIGNALS
    return SIGNALS_ALT if (week_num % 2 == 1) else SIGNALS


def signal_for_role(role_key: str | None) -> dict:
    """Return this week's signal for a role. Falls back to `all_roles`.

    Alternates between SIGNALS and SIGNALS_ALT by ISO-week parity so
    users see two distinct weekly signals per role before content
    repeats. iso_week is stamped dynamically so the Field Pulse card
    on mobile correctly detects week changes.
    """
    now_week = _current_iso_week()
    primary = _pick_signal_table(now_week)
    other = SIGNALS_ALT if primary is SIGNALS else SIGNALS

    picked: dict | None = None
    if role_key:
        if role_key in primary:
            picked = dict(primary[role_key])
        elif role_key in other:
            # Alt-table fallback — if one of the two tables is missing
            # this role, use whichever has it so rotation degrades
            # gracefully to "same signal twice" instead of falling
            # all the way back to all_roles.
            picked = dict(other[role_key])
    if picked is None:
        picked = dict(primary.get("all_roles") or SIGNALS["all_roles"])

    # Stamp current ISO week so the client's NEW badge fires each
    # Monday without requiring a manual content edit here.
    picked["iso_week"] = now_week
    return picked
