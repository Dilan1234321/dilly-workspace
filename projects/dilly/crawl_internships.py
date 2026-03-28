"""
Dilly Internship Crawler — Lightweight
=======================================
Hits Greenhouse and Lever public JSON APIs for curated companies.
Filters for internship roles. Writes to dilly_jobs.db (SQLite).

Run:  python projects/dilly/crawl_internships.py
Cron: run daily or weekly to keep listings fresh.

No auth, no Redis, no Playwright, no external infra required.
"""

import json
import os
import re
import sqlite3
import time
import uuid
import urllib.request
import urllib.error
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dilly_jobs.db")

# ── Schema ─────────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    description TEXT,
    url TEXT,
    posted_date TEXT,
    source TEXT,
    job_type TEXT DEFAULT 'internship',
    scraped_at REAL,
    tags TEXT,
    team TEXT,
    remote INTEGER DEFAULT 0,
    required_scores TEXT
);
"""

# ── Companies to crawl ─────────────────────────────────────────────────────────
# Greenhouse: board slug → display name
# Find board slugs at: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs

GREENHOUSE_COMPANIES = {
    "airbnb":           "Airbnb",
    "airtable":         "Airtable",
    "anthropic":        "Anthropic",
    "cloudflare":       "Cloudflare",
    "coinbase":         "Coinbase",
    "databricks":       "Databricks",
    "discord":          "Discord",
    "doordash":         "DoorDash",
    "figma":            "Figma",
    "instacart":        "Instacart",
    "mongodbinc":       "MongoDB",
    "notion":           "Notion",
    "openai":           "OpenAI",
    "palantir":         "Palantir",
    "pinterest":        "Pinterest",
    "plaid":            "Plaid",
    "reddit":           "Reddit",
    "robinhood":        "Robinhood",
    "scale":            "Scale AI",
    "snowflake":        "Snowflake",
    "stripe":           "Stripe",
    "twitch":           "Twitch",
    "verkada":          "Verkada",
}

# Lever: company slug → display name
# API: https://api.lever.co/v0/postings/{slug}?mode=json

LEVER_COMPANIES = {
    "ramp":             "Ramp",
    "anduril":          "Anduril",
    "Netflix":          "Netflix",
    "JUUL":             "Juul",
    "blueyonder":       "Blue Yonder",
    "relativityspace":  "Relativity Space",
    "verkada":          "Verkada",
    "watershed":        "Watershed",
}

# ── Internship detection ───────────────────────────────────────────────────────

INTERN_PATTERNS = [
    re.compile(r'\bintern\b', re.IGNORECASE),
    re.compile(r'\binternship\b', re.IGNORECASE),
    re.compile(r'\bco-op\b', re.IGNORECASE),
    re.compile(r'\bsummer\s+\d{4}\b', re.IGNORECASE),
    re.compile(r'\bsummer\s+analyst\b', re.IGNORECASE),
    re.compile(r'\bsummer\s+associate\b', re.IGNORECASE),
]

def is_internship(title: str) -> bool:
    return any(p.search(title) for p in INTERN_PATTERNS)

# ── Remote detection ───────────────────────────────────────────────────────────

def is_remote(location: str) -> bool:
    loc = (location or "").lower()
    return "remote" in loc or "anywhere" in loc or "distributed" in loc

# ── Tag extraction from title ──────────────────────────────────────────────────

TAG_KEYWORDS = {
    "software": "Software Engineering",
    "frontend": "Frontend",
    "backend": "Backend",
    "fullstack": "Full-Stack",
    "full-stack": "Full-Stack",
    "data science": "Data Science",
    "data engineer": "Data Engineering",
    "machine learning": "Machine Learning",
    "ml ": "Machine Learning",
    "ai ": "AI",
    "artificial intelligence": "AI",
    "product": "Product",
    "design": "Design",
    "ux": "UX",
    "security": "Security",
    "cybersecurity": "Security",
    "cloud": "Cloud",
    "devops": "DevOps",
    "mobile": "Mobile",
    "ios": "iOS",
    "android": "Android",
    "finance": "Finance",
    "analyst": "Analytics",
    "marketing": "Marketing",
    "sales": "Sales",
    "operations": "Operations",
    "research": "Research",
    "hardware": "Hardware",
    "mechanical": "Mechanical Engineering",
    "electrical": "Electrical Engineering",
    "consulting": "Consulting",
    "quantitative": "Quantitative",
}

def extract_tags(title: str, description: str = "") -> list[str]:
    text = f"{title} {description[:500]}".lower()
    tags = []
    for keyword, tag in TAG_KEYWORDS.items():
        if keyword in text and tag not in tags:
            tags.append(tag)
    return tags[:6]

# ── HTTP helper ────────────────────────────────────────────────────────────────

def fetch_json(url: str, timeout: int = 15) -> Optional[list | dict]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Dilly/1.0 (internship crawler)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as e:
        print(f"  [WARN] Failed to fetch {url}: {e}")
        return None

# ── Greenhouse crawler ─────────────────────────────────────────────────────────

def crawl_greenhouse(slug: str, company_name: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    data = fetch_json(url)
    if not data or not isinstance(data, dict):
        return []

    jobs_raw = data.get("jobs", [])
    results = []

    for job in jobs_raw:
        title = (job.get("title") or "").strip()
        if not is_internship(title):
            continue

        location_parts = []
        for loc in (job.get("location") or {}).get("name", "").split(","):
            location_parts.append(loc.strip())
        location = ", ".join(location_parts) or ""

        # Clean HTML from description
        desc_html = job.get("content") or ""
        desc_text = re.sub(r"<[^>]+>", " ", desc_html)
        desc_text = re.sub(r"\s+", " ", desc_text).strip()[:3000]

        departments = [d.get("name", "") for d in (job.get("departments") or [])]
        team = departments[0] if departments else ""

        posted = ""
        if job.get("updated_at"):
            posted = job["updated_at"][:10]
        elif job.get("first_published_at"):
            posted = job["first_published_at"][:10]

        apply_url = job.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{job.get('id', '')}"

        results.append({
            "external_id": f"gh-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "location": location,
            "description": desc_text,
            "url": apply_url,
            "posted_date": posted,
            "source": "Greenhouse",
            "team": team,
            "remote": is_remote(location),
            "tags": extract_tags(title, desc_text),
        })

    return results

# ── Lever crawler ──────────────────────────────────────────────────────────────

def crawl_lever(slug: str, company_name: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    data = fetch_json(url)
    if not data or not isinstance(data, list):
        return []

    results = []

    for job in data:
        title = (job.get("text") or "").strip()
        if not is_internship(title):
            continue

        categories = job.get("categories") or {}
        location = categories.get("location") or ""
        team = categories.get("team") or categories.get("department") or ""

        # Description from lists
        desc_parts = []
        for section in (job.get("lists") or []):
            desc_parts.append(section.get("text", ""))
            for item in (section.get("content") or "").split("<li>"):
                clean = re.sub(r"<[^>]+>", "", item).strip()
                if clean:
                    desc_parts.append(clean)
        desc_text = " ".join(desc_parts)[:3000]
        if not desc_text:
            desc_text = re.sub(r"<[^>]+>", " ", job.get("descriptionPlain") or job.get("description") or "")
            desc_text = re.sub(r"\s+", " ", desc_text).strip()[:3000]

        posted = ""
        if job.get("createdAt"):
            try:
                posted = time.strftime("%Y-%m-%d", time.gmtime(job["createdAt"] / 1000))
            except Exception:
                pass

        apply_url = job.get("hostedUrl") or job.get("applyUrl") or ""

        results.append({
            "external_id": f"lever-{slug}-{job.get('id', '')}",
            "title": title,
            "company": company_name,
            "location": location,
            "description": desc_text,
            "url": apply_url,
            "posted_date": posted,
            "source": "Lever",
            "team": team,
            "remote": is_remote(location),
            "tags": extract_tags(title, desc_text),
        })

    return results

# ── Database writer ────────────────────────────────────────────────────────────

def write_to_db(listings: list[dict]) -> int:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(SCHEMA)

    inserted = 0
    now = time.time()

    for job in listings:
        job_id = uuid.uuid4().hex[:12]
        try:
            conn.execute(
                """INSERT OR IGNORE INTO jobs
                (id, external_id, title, company, location, description, url, posted_date, source, job_type, scraped_at, tags, team, remote, required_scores)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    job_id,
                    job["external_id"],
                    job["title"],
                    job["company"],
                    job.get("location", ""),
                    job.get("description", ""),
                    job.get("url", ""),
                    job.get("posted_date", ""),
                    job.get("source", ""),
                    "internship",
                    now,
                    json.dumps(job.get("tags", [])),
                    job.get("team", ""),
                    1 if job.get("remote") else 0,
                    json.dumps({}),  # required_scores — filled by matching later
                ),
            )
            if conn.total_changes:
                inserted += 1
        except sqlite3.IntegrityError:
            pass  # Duplicate external_id, skip

    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    conn.close()
    return inserted

# ── Main ───────────────────────────────────────────────────────────────────────

def crawl_all():
    print("=" * 60)
    print("Dilly Internship Crawler")
    print("=" * 60)

    all_listings = []

    # Greenhouse
    print(f"\n[Greenhouse] Crawling {len(GREENHOUSE_COMPANIES)} companies...")
    for slug, name in GREENHOUSE_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        jobs = crawl_greenhouse(slug, name)
        print(f"{len(jobs)} internships")
        all_listings.extend(jobs)
        time.sleep(0.3)  # Be polite

    # Lever
    print(f"\n[Lever] Crawling {len(LEVER_COMPANIES)} companies...")
    for slug, name in LEVER_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        jobs = crawl_lever(slug, name)
        print(f"{len(jobs)} internships")
        all_listings.extend(jobs)
        time.sleep(0.3)

    # Write to DB
    print(f"\n[DB] Writing {len(all_listings)} listings to {DB_PATH}...")
    new = write_to_db(all_listings)

    total = 0
    if os.path.isfile(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        conn.close()

    print(f"\n{'=' * 60}")
    print(f"Done! {new} new listings added. {total} total in database.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    crawl_all()