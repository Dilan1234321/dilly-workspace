"""
audit_slugs.py — probe every company slug in crawl_internships_v2.py
and report which boards are alive, dead, or moved.

Usage:
    python3 scripts/audit_slugs.py

Writes:
    - scripts/slug_audit_report.txt   (human-readable summary)
    - scripts/slug_audit_report.json  (machine-readable, for bulk fix)

What it does:
    - For each slug in GREENHOUSE/LEVER/ASHBY/SMARTRECRUITERS maps, pings
      the public board API.
    - Classifies: alive (returned ≥1 job), empty (200 but no jobs),
      404 (slug is dead), error (timeout/network).
    - For 404s on Greenhouse, tries a few common transforms (strip
      suffix, add/remove "inc", swap "-" for ""), and reports any that
      work.
    - Prints a compact summary + writes a JSON corrections file you can
      review before merging back into crawl_internships_v2.py.

This is a READ-ONLY script — it does not modify the crawler or the DB.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Allow running from anywhere; we just need to import the crawler maps.
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Defer import so we pick up the current state of the catalog.
from crawl_internships_v2 import (  # noqa: E402
    GREENHOUSE_COMPANIES,
    LEVER_COMPANIES,
    ASHBY_COMPANIES,
    SMARTRECRUITERS_COMPANIES,
)

TIMEOUT = 8
USER_AGENT = "DillyBot/2.0 (slug-audit)"


def _fetch(url: str, timeout: int = TIMEOUT):
    """Return (status, payload_or_None). 200 implies payload was valid JSON."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
            try:
                return status, json.loads(body)
            except Exception:
                return status, None
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def probe_greenhouse(slug: str) -> dict:
    status, payload = _fetch(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
    jobs = (payload or {}).get("jobs") if isinstance(payload, dict) else None
    return {
        "ats": "greenhouse",
        "slug": slug,
        "status": status,
        "job_count": len(jobs) if isinstance(jobs, list) else 0,
    }


def probe_lever(slug: str) -> dict:
    status, payload = _fetch(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    jobs = payload if isinstance(payload, list) else None
    return {
        "ats": "lever",
        "slug": slug,
        "status": status,
        "job_count": len(jobs) if isinstance(jobs, list) else 0,
    }


def probe_ashby(slug: str) -> dict:
    # Ashby public JSON API
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false"
    status, payload = _fetch(url)
    jobs = (payload or {}).get("jobs") if isinstance(payload, dict) else None
    return {
        "ats": "ashby",
        "slug": slug,
        "status": status,
        "job_count": len(jobs) if isinstance(jobs, list) else 0,
    }


def probe_smartrecruiters(slug: str) -> dict:
    url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"
    status, payload = _fetch(url)
    # SmartRecruiters wraps in totalFound/content
    total = (payload or {}).get("totalFound") if isinstance(payload, dict) else None
    return {
        "ats": "smartrecruiters",
        "slug": slug,
        "status": status,
        "job_count": int(total) if total is not None else 0,
    }


PROBE_BY_ATS = {
    "greenhouse": probe_greenhouse,
    "lever": probe_lever,
    "ashby": probe_ashby,
    "smartrecruiters": probe_smartrecruiters,
}


def _suggest_greenhouse_alts(slug: str) -> list[str]:
    """Try a handful of cheap slug transforms to recover 404s."""
    alts: list[str] = []
    base = slug.lower()
    # Dash variations
    if "-" in base:
        alts.append(base.replace("-", ""))
    else:
        # Common pattern: insert dash before 'inc', 'co', 'corp'
        for suffix in ("inc", "co", "corp", "labs", "io"):
            if base.endswith(suffix) and len(base) > len(suffix) + 2:
                alts.append(f"{base[:-len(suffix)]}-{suffix}")
    # Strip trailing "inc"/"corp"
    for suffix in ("inc", "corp", "co"):
        if base.endswith(suffix):
            alts.append(base[:-len(suffix)])
    # De-dupe and drop the original
    return [a for a in dict.fromkeys(alts) if a and a != base]


def audit(parallelism: int = 20) -> dict:
    tasks: list[tuple[str, str, str]] = []  # (ats, slug, display_name)
    for slug, (name, _industry) in GREENHOUSE_COMPANIES.items():
        tasks.append(("greenhouse", slug, name))
    for slug, (name, _industry) in LEVER_COMPANIES.items():
        tasks.append(("lever", slug, name))
    for slug, (name, _industry) in ASHBY_COMPANIES.items():
        tasks.append(("ashby", slug, name))
    for slug, (name, _industry) in SMARTRECRUITERS_COMPANIES.items():
        tasks.append(("smartrecruiters", slug, name))

    print(f"[audit] probing {len(tasks)} slugs across 4 ATSes (parallel={parallelism}) ...")
    results: list[dict] = []
    started = time.time()

    with ThreadPoolExecutor(max_workers=parallelism) as pool:
        futures = {
            pool.submit(PROBE_BY_ATS[ats], slug): (ats, slug, display)
            for (ats, slug, display) in tasks
        }
        done = 0
        for fut in as_completed(futures):
            ats, slug, display = futures[fut]
            r = fut.result()
            r["display_name"] = display
            results.append(r)
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(tasks)} done ({int(time.time() - started)}s)")

    # Bucket
    alive = [r for r in results if r["status"] == 200 and r["job_count"] > 0]
    empty = [r for r in results if r["status"] == 200 and r["job_count"] == 0]
    dead = [r for r in results if r["status"] not in (0, 200)]
    err = [r for r in results if r["status"] == 0]

    # Try alt slugs for Greenhouse 404s (cheap, sequential, capped)
    suggestions: dict[str, list[dict]] = {}
    gh_404s = [r for r in dead if r["ats"] == "greenhouse"][:80]
    for r in gh_404s:
        alts = _suggest_greenhouse_alts(r["slug"])
        found = []
        for alt in alts:
            probe = probe_greenhouse(alt)
            if probe["status"] == 200 and probe["job_count"] > 0:
                found.append({"try": alt, "jobs": probe["job_count"]})
                break  # first hit is enough
        if found:
            suggestions[r["slug"]] = found

    summary = {
        "totals": {
            "total": len(results),
            "alive": len(alive),
            "empty": len(empty),
            "dead": len(dead),
            "network_error": len(err),
        },
        "alive_by_ats": _count_by_ats(alive),
        "dead_by_ats": _count_by_ats(dead),
        "top_empty": sorted(
            [(r["ats"], r["slug"], r["display_name"]) for r in empty],
            key=lambda t: (t[0], t[1]),
        )[:50],
        "dead_sample": sorted(
            [(r["ats"], r["slug"], r["display_name"], r["status"]) for r in dead],
            key=lambda t: (t[0], t[1]),
        ),
        "recovery_suggestions": suggestions,
    }
    return summary


def _count_by_ats(rows: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for r in rows:
        out[r["ats"]] = out.get(r["ats"], 0) + 1
    return out


def _write_report(summary: dict) -> None:
    out_json = HERE / "slug_audit_report.json"
    out_txt = HERE / "slug_audit_report.txt"
    out_json.write_text(json.dumps(summary, indent=2, sort_keys=True))

    lines: list[str] = []
    t = summary["totals"]
    lines.append("=== SLUG AUDIT ===\n")
    lines.append(f"Total slugs probed: {t['total']}")
    lines.append(f"  alive (≥1 job):  {t['alive']}")
    lines.append(f"  empty (200, 0 jobs): {t['empty']}")
    lines.append(f"  dead (non-200): {t['dead']}")
    lines.append(f"  network_error:  {t['network_error']}\n")
    lines.append("By ATS — alive:")
    for k, v in sorted(summary["alive_by_ats"].items()):
        lines.append(f"  {k}: {v}")
    lines.append("\nBy ATS — dead:")
    for k, v in sorted(summary["dead_by_ats"].items()):
        lines.append(f"  {k}: {v}")

    if summary["recovery_suggestions"]:
        lines.append("\n=== RECOVERY SUGGESTIONS (Greenhouse) ===")
        for slug, hits in summary["recovery_suggestions"].items():
            for h in hits:
                lines.append(f"  {slug!r} → try {h['try']!r} ({h['jobs']} jobs)")
    else:
        lines.append("\n(no auto-recovery suggestions — may need manual research)")

    lines.append("\n=== FIRST 80 DEAD SLUGS ===")
    for ats, slug, name, status in summary["dead_sample"][:80]:
        lines.append(f"  [{ats}] {slug!r}  ({name})  → HTTP {status}")

    out_txt.write_text("\n".join(lines))
    print(f"\n[audit] wrote {out_json}")
    print(f"[audit] wrote {out_txt}\n")
    print("\n".join(lines[-20:]))


if __name__ == "__main__":
    s = audit()
    _write_report(s)
