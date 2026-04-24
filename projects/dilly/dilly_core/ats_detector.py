"""
ATS URL detector.

Given a job's apply_url, returns the canonical ATS slug used throughout
Dilly (source_ats column + _get_ats_formatting() key).

The ordering matters: more specific patterns (e.g. successfactors.com)
must come before catch-alls (e.g. sap.com). Patterns are compiled once
at import time.
"""
from __future__ import annotations

import re
from typing import Optional

# (compiled_pattern, ats_slug) pairs — checked in order, first match wins.
_RULES: list[tuple[re.Pattern, str]] = []

_RAW: list[tuple[str, str]] = [
    # ── Already-scraped (keep as-is from aggregators only if no real ATS found) ──
    # Note: URLs from SimplifyJobs/RemoteOK often link to the real ATS directly.

    # ── Greenhouse ────────────────────────────────────────────────────────
    (r"boards\.greenhouse\.io|greenhouse\.io/embed|grnh\.se", "greenhouse"),

    # ── Lever ─────────────────────────────────────────────────────────────
    (r"jobs\.lever\.co|lever\.co/", "lever"),

    # ── Ashby ─────────────────────────────────────────────────────────────
    (r"app\.ashbyhq\.com|ashbyhq\.com", "ashby"),

    # ── SmartRecruiters ───────────────────────────────────────────────────
    (r"jobs\.smartrecruiters\.com|smartrecruiters\.com", "smartrecruiters"),

    # ── Workday ───────────────────────────────────────────────────────────
    (r"myworkdayjobs\.com|wd\d+\.myworkday\.com", "workday"),

    # ── iCIMS ─────────────────────────────────────────────────────────────
    (r"careers-[^.]+\.icims\.com|icims\.com", "icims"),

    # ── Oracle Taleo ──────────────────────────────────────────────────────
    (r"taleo\.net|oraclecloud\.com.*hcm|oracle.*taleo", "taleo"),

    # ── SAP SuccessFactors ────────────────────────────────────────────────
    (r"successfactors\.(com|eu|cn)|sfsf\.com", "successfactors"),

    # ── UKG / UltiPro ─────────────────────────────────────────────────────
    (r"ultipro\.com|ukg\.com|recruiting\.ultipro", "ukg"),

    # ── ADP ───────────────────────────────────────────────────────────────
    (r"adp\.com.*careers|adp\.com.*jobs|adpcareers", "adp"),

    # ── BambooHR ──────────────────────────────────────────────────────────
    (r"bamboohr\.com/careers|bamboohr\.com/jobs|[^.]+\.bamboohr\.com", "bamboohr"),

    # ── Workable ──────────────────────────────────────────────────────────
    (r"apply\.workable\.com|workable\.com/j/", "workable"),

    # ── Jobvite ───────────────────────────────────────────────────────────
    (r"jobs\.jobvite\.com|jobvite\.com", "jobvite"),

    # ── JazzHR ────────────────────────────────────────────────────────────
    (r"applytojob\.com|jazzhr\.com", "jazzhr"),

    # ── BreezyHR ──────────────────────────────────────────────────────────
    (r"breezy\.hr|breezyhr\.com", "breezyhr"),

    # ── Recruitee ─────────────────────────────────────────────────────────
    (r"recruitee\.com", "recruitee"),

    # ── Teamtailor ────────────────────────────────────────────────────────
    (r"teamtailor\.com|[^.]+\.teamtailor\.com", "teamtailor"),

    # ── Pinpoint ──────────────────────────────────────────────────────────
    (r"pinpointhq\.com|recruitwith\.com", "pinpoint"),

    # ── Comeet ────────────────────────────────────────────────────────────
    (r"comeet\.com", "comeet"),

    # ── Fountain ──────────────────────────────────────────────────────────
    (r"getfountain\.com|fountain\.com", "fountain"),

    # ── Paylocity ─────────────────────────────────────────────────────────
    (r"paylocity\.com.*careers|recruiting\.paylocity", "paylocity"),

    # ── Dayforce / Ceridian ───────────────────────────────────────────────
    (r"dayforce\.com|ceridian\.com.*careers|ufcfcu\.org.*dayforce", "dayforce"),

    # ── Paycom ────────────────────────────────────────────────────────────
    (r"paycom\.com.*careers|paycomonline", "paycom"),

    # ── Personio ──────────────────────────────────────────────────────────
    (r"personio\.com/jobs|personio\.de", "personio"),

    # ── Eightfold AI ──────────────────────────────────────────────────────
    (r"eightfold\.ai", "eightfold"),

    # ── Phenom ────────────────────────────────────────────────────────────
    (r"phenompeople\.com|phenom\.com", "phenom"),

    # ── Beamery ───────────────────────────────────────────────────────────
    (r"beamery\.com", "beamery"),

    # ── Avature ───────────────────────────────────────────────────────────
    (r"avature\.net", "avature"),

    # ── Zoho Recruit ──────────────────────────────────────────────────────
    (r"zohorecruit\.com|zoho\.com.*recruit", "zoho_recruit"),

    # ── Bullhorn ──────────────────────────────────────────────────────────
    (r"bullhornreach\.com|bullhorn\.com.*career", "bullhorn"),

    # ── Cornerstone OnDemand ──────────────────────────────────────────────
    (r"cornerstoneondemand\.com|csod\.com", "cornerstone"),

    # ── JazzHR / CATS alias ───────────────────────────────────────────────
    (r"catsone\.com", "cats_ats"),

    # ── Loxo ──────────────────────────────────────────────────────────────
    (r"loxo\.co", "loxo"),

    # ── Jobsoid ───────────────────────────────────────────────────────────
    (r"jobsoid\.com", "jobsoid"),

    # ── Manatal ───────────────────────────────────────────────────────────
    (r"manatal\.com", "manatal"),

    # ── Freshteam / Freshworks ────────────────────────────────────────────
    (r"freshteam\.com|freshworks\.com.*recruit", "freshteam"),

    # ── BreezyHR alias ────────────────────────────────────────────────────
    (r"[^.]+\.breezy\.hr", "breezyhr"),

    # ── Hireology ─────────────────────────────────────────────────────────
    (r"hireology\.com", "hireology"),

    # ── HireHive ──────────────────────────────────────────────────────────
    (r"hirehive\.com", "hirehive"),

    # ── JobAdder ──────────────────────────────────────────────────────────
    (r"jobadder\.com", "jobadder"),

    # ── Keka ──────────────────────────────────────────────────────────────
    (r"keka\.com", "keka"),

    # ── Darwinbox ─────────────────────────────────────────────────────────
    (r"darwinbox\.com", "darwinbox"),

    # ── TurboHire ─────────────────────────────────────────────────────────
    (r"turbo-hire\.com|turbohire\.co", "turbohire"),

    # ── GoHire ────────────────────────────────────────────────────────────
    (r"gohire\.io", "gohire"),

    # ── Jobylon ───────────────────────────────────────────────────────────
    (r"jobylon\.com", "jobylon"),

    # ── ApplicantStack ────────────────────────────────────────────────────
    (r"applicantstack\.com", "applicantstack"),

    # ── Odoo Recruitment ──────────────────────────────────────────────────
    (r"odoo\.com.*jobs|[^.]+\.odoo\.com.*jobs", "odoo"),

    # ── OrangeHRM ─────────────────────────────────────────────────────────
    (r"orangehrm\.com", "orangehrm"),

    # ── ClearCompany ──────────────────────────────────────────────────────
    (r"clearcompany\.com", "clearcompany"),

    # ── TalentLyft ────────────────────────────────────────────────────────
    (r"talentlyft\.com", "talentlyft"),

    # ── ReachMee ──────────────────────────────────────────────────────────
    (r"reachmee\.com", "reachmee"),

    # ── Gem ───────────────────────────────────────────────────────────────
    (r"gem\.com", "gem"),

    # ── SeekOut ───────────────────────────────────────────────────────────
    (r"seekout\.com", "seekout"),

    # ── Spark Hire ────────────────────────────────────────────────────────
    (r"sparkhire\.com", "sparkhire"),

    # ── Broadbean ─────────────────────────────────────────────────────────
    (r"broadbean\.com", "broadbean"),

    # ── JobDiva ───────────────────────────────────────────────────────────
    (r"jobdiva\.com", "jobdiva"),

    # ── niche / known domains ──────────────────────────────────────────────
    (r"usajobs\.gov", "usajobs"),
    (r"nsf\.gov.*reu", "nsf_reu"),

    # ── Applied to LinkedIn ────────────────────────────────────────────────
    (r"linkedin\.com/jobs", "linkedin"),

    # ── Indeed ────────────────────────────────────────────────────────────
    (r"indeed\.com", "indeed"),

    # ── Aggregators (last — only if no real ATS URL found) ────────────────
    (r"simplify\.jobs", "simplify"),
    (r"remoteok\.com", "remoteok"),
    (r"weworkremotely\.com", "weworkremotely"),
]

# Compile once
for _pattern, _slug in _RAW:
    _RULES.append((re.compile(_pattern, re.IGNORECASE), _slug))

del _pattern, _slug


def detect_ats(apply_url: str) -> Optional[str]:
    """
    Return the canonical ATS slug for the given apply URL, or None if unknown.
    Caller should fall back to source_ats already on the record if this returns None.
    """
    if not apply_url:
        return None
    for pattern, slug in _RULES:
        if pattern.search(apply_url):
            return slug
    return None


def detect_ats_or_keep(apply_url: str, existing_source_ats: str) -> str:
    """
    Detect ATS from URL; fall back to existing value if detection yields None
    or an aggregator-level slug (simplify, remoteok, weworkremotely).
    """
    AGGREGATORS = {"simplify", "remoteok", "weworkremotely", "unknown", ""}
    detected = detect_ats(apply_url)
    if detected and detected not in AGGREGATORS:
        return detected
    if existing_source_ats and existing_source_ats not in AGGREGATORS:
        return existing_source_ats
    return detected or existing_source_ats or "greenhouse"
