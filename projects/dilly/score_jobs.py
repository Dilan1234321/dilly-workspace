"""
Dilly Job Scorer — LLM-based required score estimation
=======================================================
Analyzes job descriptions to estimate what Smart, Grit, and Build scores
a candidate would need to be competitive.

Run after crawling:  python projects/dilly/score_jobs.py
Cost: ~$0.003 per listing. 100 listings ≈ $0.30.

Caches results in dilly_jobs.db so it only scores each listing once.
"""

import json
import os
import sqlite3
import sys
import time

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dilly_jobs.db")

# ── Scoring prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert career advisor who analyzes job descriptions to estimate what resume scores a college student would need to be competitive.

You score on three dimensions, each 0-100:

**SMART (Academic & Analytical Signals)**
What it measures: GPA emphasis, technical knowledge depth, research, analytical rigor, academic honors.
- 90+: PhD-track research roles, quant finance, elite consulting. JD mentions "top academic credentials," research publications, advanced math.
- 75-89: Strong technical roles at top companies. JD mentions specific CS/math courses, algorithms, system design knowledge.
- 60-74: Standard technical or analytical roles. JD mentions "strong academic background" but doesn't require specific coursework.
- 40-59: Roles where academics matter less than output. JD focuses on practical skills over credentials.
- Below 40: Roles with no academic requirements mentioned.

**GRIT (Leadership, Initiative & Persistence)**
What it measures: Leadership roles, initiative, extracurriculars, quantified impact, teamwork, communication.
- 90+: Leadership-intensive roles (consulting, PM, management). JD emphasizes "led teams," "drove results," "stakeholder management."
- 75-89: Roles requiring collaboration and initiative. JD mentions "cross-functional," "self-starter," "ownership."
- 60-74: Standard team roles. JD mentions "team player," "communication skills."
- 40-59: Individual contributor roles with minimal leadership emphasis.
- Below 40: Solo/heads-down technical work with no leadership language.

**BUILD (Tangible Output & Technical Execution)**
What it measures: Projects shipped, code deployed, things built, quantified outcomes, tools used, portfolio.
- 90+: Roles demanding shipped products, deployed systems, measurable engineering output. JD lists specific frameworks, asks for GitHub/portfolio.
- 75-89: Roles wanting hands-on builders. JD mentions "built," "shipped," "deployed," specific tech stacks.
- 60-74: Roles with some technical execution. JD mentions tools but doesn't require portfolio evidence.
- 40-59: Roles more about analysis than building. JD is light on technical specifics.
- Below 40: Non-technical roles (admin, coordination, basic research assistance).

You also provide a brief explanation of WHY each score is what it is, referencing specific language from the JD.

Respond ONLY with valid JSON, no markdown backticks, no preamble:
{
  "smart": <number 0-100>,
  "grit": <number 0-100>,
  "build": <number 0-100>,
  "smart_why": "<1-2 sentences explaining the Smart score, referencing JD language>",
  "grit_why": "<1-2 sentences explaining the Grit score, referencing JD language>",
  "build_why": "<1-2 sentences explaining the Build score, referencing JD language>",
  "overall_bar": "<one sentence: what kind of candidate clears the bar for this role>"
}"""


def score_single_job(client, title: str, company: str, description: str) -> dict | None:
    """Score a single job listing using Claude."""
    user_msg = f"""Analyze this internship listing and estimate the required Smart, Grit, and Build scores (0-100):

**Company:** {company}
**Title:** {title}
**Description:**
{description[:3000]}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = response.content[0].text.strip()
        # Strip markdown backticks if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"  [ERROR] Failed to score: {e}")
        return None


def score_all_jobs():
    """Score all unscored jobs in the database."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        # Try loading from .env
        env_path = os.path.join(_WORKSPACE_ROOT, ".env")
        if os.path.isfile(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.strip().startswith("ANTHROPIC_API_KEY"):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
    if not api_key:
        print("[ERROR] ANTHROPIC_API_KEY not set. Add it to .env")
        return

    try:
        import anthropic
    except ImportError:
        print("[ERROR] anthropic SDK not installed. Run: pip install anthropic")
        return

    client = anthropic.Anthropic(api_key=api_key)

    if not os.path.isfile(DB_PATH):
        print(f"[ERROR] Database not found: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Find jobs without required_scores (empty JSON or NULL)
    rows = conn.execute(
        "SELECT id, title, company, description, required_scores FROM jobs ORDER BY scraped_at DESC"
    ).fetchall()

    to_score = []
    for r in rows:
        rs = r["required_scores"]
        if not rs or rs == "{}" or rs == "null":
            to_score.append(dict(r))
        else:
            try:
                parsed = json.loads(rs)
                if not parsed.get("smart"):
                    to_score.append(dict(r))
            except (json.JSONDecodeError, TypeError):
                to_score.append(dict(r))

    print(f"{'=' * 60}")
    print(f"Dilly Job Scorer")
    print(f"{'=' * 60}")
    print(f"Total jobs: {len(rows)}")
    print(f"Need scoring: {len(to_score)}")
    print()

    if not to_score:
        print("All jobs already scored!")
        conn.close()
        return

    scored = 0
    failed = 0

    for i, job in enumerate(to_score):
        title = job["title"]
        company = job["company"]
        desc = job["description"] or ""

        print(f"  [{i+1}/{len(to_score)}] {company} — {title}...", end=" ", flush=True)

        if len(desc) < 50:
            print("SKIP (no description)")
            failed += 1
            continue

        result = score_single_job(client, title, company, desc)

        if result and isinstance(result.get("smart"), (int, float)):
            # Save to DB
            scores_json = json.dumps(result)
            conn.execute(
                "UPDATE jobs SET required_scores = ? WHERE id = ?",
                (scores_json, job["id"]),
            )
            conn.commit()
            print(f"S:{result['smart']} G:{result['grit']} B:{result['build']}")
            scored += 1
        else:
            print("FAILED")
            failed += 1

        # Rate limit: ~1 request per second
        time.sleep(0.5)

    conn.close()

    print(f"\n{'=' * 60}")
    print(f"Done! Scored: {scored}, Failed: {failed}, Skipped: {len(to_score) - scored - failed}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    score_all_jobs()