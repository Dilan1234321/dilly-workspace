"""
Layer 3 — Certifications extraction.
"""
import re
from typing import List, Set

from ..types import ExtractedField

KNOWN_CERTS: Set[str] = {
    # AWS
    "aws certified cloud practitioner",
    "aws certified developer",
    "aws certified solutions architect associate",
    "aws certified solutions architect professional",
    "aws certified devops engineer professional",
    "aws certified sysops administrator",
    "aws certified data engineer associate",
    "aws certified machine learning specialty",
    "aws certified advanced networking specialty",
    "aws certified security specialty",
    # Google Cloud
    "google cloud digital leader",
    "google cloud associate cloud engineer",
    "google cloud professional cloud architect",
    "google cloud professional data engineer",
    "google cloud professional machine learning engineer",
    "google cloud professional cloud developer",
    "google cloud professional cloud devops engineer",
    "google cloud professional cloud security engineer",
    # Azure
    "microsoft azure fundamentals",
    "microsoft azure administrator associate",
    "microsoft azure developer associate",
    "microsoft azure solutions architect expert",
    "microsoft azure security engineer associate",
    "microsoft azure ai engineer associate",
    "microsoft azure data engineer associate",
    "microsoft azure database administrator associate",
    # CompTIA
    "comptia itf+",
    "comptia a+",
    "comptia network+",
    "comptia security+",
    "comptia linux+",
    "comptia cloud+",
    "comptia cysa+",
    "comptia pentest+",
    "comptia casp+",
    # Security / IT governance
    "cissp", "cism", "cisa", "crisc", "ceh", "oscp", "ccsp", "gsec", "gpEN",
    # Finance
    "cpa", "cfa level i", "cfa level ii", "cfa level iii", "cfp", "frm part i", "frm part ii",
    "series 7", "series 63", "series 65", "series 66", "bloomberg market concepts",
    # PM / Agile
    "pmp", "capm", "scrum master", "csm", "psm i", "psm ii", "safe agilist", "prince2",
    "six sigma yellow belt", "six sigma green belt", "six sigma black belt",
    # HR
    "shrm-cp", "shrm-scp", "phr", "sphr",
    # Sales / marketing / analytics
    "hubspot inbound", "hubspot content marketing", "hubspot email marketing",
    "salesforce administrator", "salesforce advanced administrator", "salesforce platform app builder",
    "salesforce platform developer i", "google analytics", "google ads search", "google ads display",
    "meta blueprint", "tableau desktop specialist", "tableau certified data analyst",
    "microsoft power bi data analyst",
    # Adobe
    "adobe certified professional photoshop",
    "adobe certified professional illustrator",
    "adobe certified professional indesign",
    "adobe certified professional premiere pro",
    "adobe certified professional after effects",
    # Data / AI
    "databricks certified data engineer associate",
    "databricks certified data engineer professional",
    "snowpro core certification",
    "oracle certified professional",
    "sas certified specialist",
    # Education platforms
    "coursera certificate", "edx certificate", "udemy certificate",
}


def extract_certifications(
    certifications_section_text: str,
    skills_section_text: str,
    experience_section_text: str = "",
) -> ExtractedField:
    """Search CERTIFICATIONS, SKILLS, EXPERIENCE for certification mentions."""
    combined = (
        (certifications_section_text or "")
        + "\n"
        + (skills_section_text or "")
        + "\n"
        + (experience_section_text or "")
    ).lower()
    found: Set[str] = set()
    for cert in KNOWN_CERTS:
        if re.search(r"\b" + re.escape(cert) + r"\b", combined):
            found.add(cert.title())

    # Patterns: "Certified [X]", "[X] Certified", "[X] Certification", "[X] Certificate", "[X] Licensed"
    for m in re.finditer(r"Certified\s+([A-Za-z0-9\s&]+?)(?:\s|$|,|\.)", combined, re.I):
        found.add(f"Certified {m.group(1).strip().title()}")
    for m in re.finditer(r"([A-Za-z0-9\s&]+?)\s+Certified(?:\s|$|,|\.)", combined, re.I):
        found.add(f"{m.group(1).strip().title()} Certified")
    for m in re.finditer(r"([A-Za-z0-9\s&+/\-]+?)\s+Certification(?:\s|$|,|\.)", combined, re.I):
        found.add(f"{m.group(1).strip().title()} Certification")
    for m in re.finditer(r"([A-Za-z0-9\s&+/\-]+?)\s+Certificate(?:\s|$|,|\.)", combined, re.I):
        found.add(f"{m.group(1).strip().title()} Certificate")
    for m in re.finditer(r"([A-Za-z0-9\s&+/\-]+?)\s+Licensed(?:\s|$|,|\.)", combined, re.I):
        found.add(f"{m.group(1).strip().title()} Licensed")

    confidence = "high" if certifications_section_text and found else "medium" if found else "low"
    return ExtractedField(
        value=list(found),
        confidence=confidence,
        strategy="regex+dict",
        raw=certifications_section_text[:300] if certifications_section_text else None,
    )
