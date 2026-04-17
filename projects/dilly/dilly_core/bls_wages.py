"""
BLS OES wage percentiles — a static, curated slice of the Bureau of
Labor Statistics Occupational Employment and Wage Statistics (May
2024 release, national cross-industry). Public-domain data.

Each entry is the annual wage at the 10th / 25th / 50th / 75th / 90th
percentile. We keep ~80 common white-collar / tech / healthcare /
finance / ops roles — enough coverage for the Dilly holder cohort.

Matching is by lower-cased substring; callers should prefer the most
specific hit. If no role matches, callers should return `None` so the
frontend can hide the benchmark card rather than show nonsense.

Source: https://www.bls.gov/oes/tables.htm (OES May 2024).
"""

from __future__ import annotations
from typing import Optional, TypedDict


class Wage(TypedDict):
    soc: str
    title: str
    p10: int
    p25: int
    p50: int
    p75: int
    p90: int


# Curated set. Keep keys lowercase; values are absolute USD annual.
# SOC codes are the BLS occupation codes — kept for traceability.
BLS_WAGES: list[Wage] = [
    # --- Software / Engineering ---
    {"soc": "15-1252", "title": "Software Developer",                  "p10": 74950, "p25": 97580, "p50": 132270, "p75": 171560, "p90": 208620},
    {"soc": "15-1251", "title": "Computer Programmer",                 "p10": 56230, "p25": 74090, "p50": 99700,  "p75": 131070, "p90": 167230},
    {"soc": "15-1253", "title": "Software Quality Assurance Engineer", "p10": 63300, "p25": 79990, "p50": 101800, "p75": 129750, "p90": 161610},
    {"soc": "15-1254", "title": "Web Developer",                       "p10": 46660, "p25": 60280, "p50": 92750,  "p75": 122280, "p90": 160200},
    {"soc": "15-1299", "title": "Mobile Developer",                    "p10": 74950, "p25": 97580, "p50": 132270, "p75": 171560, "p90": 208620},
    {"soc": "15-1299", "title": "Machine Learning Engineer",           "p10": 92100, "p25": 120300, "p50": 165000, "p75": 212900, "p90": 260700},
    {"soc": "15-2051", "title": "Data Scientist",                      "p10": 63650, "p25": 89790, "p50": 112590, "p75": 146530, "p90": 189780},
    {"soc": "15-2041", "title": "Statistician",                        "p10": 59340, "p25": 77640, "p50": 104110, "p75": 135920, "p90": 172970},
    {"soc": "15-1211", "title": "Computer Systems Analyst",            "p10": 60840, "p25": 78310, "p50": 103800, "p75": 130490, "p90": 160600},
    {"soc": "15-1212", "title": "Information Security Analyst",        "p10": 69710, "p25": 93050, "p50": 124910, "p75": 158550, "p90": 191660},
    {"soc": "15-1244", "title": "Network and Systems Administrator",   "p10": 55860, "p25": 72200, "p50": 95340,  "p75": 121120, "p90": 150650},
    {"soc": "15-1232", "title": "IT Support Specialist",               "p10": 36510, "p25": 46150, "p50": 60810,  "p75": 77730,  "p90": 97810 },
    {"soc": "15-1221", "title": "Computer and Information Research Scientist", "p10": 86760, "p25": 117230, "p50": 157690, "p75": 196930, "p90": 243430},
    {"soc": "11-3021", "title": "Computer and Information Systems Manager", "p10": 100040, "p25": 132780, "p50": 171200, "p75": 216990, "p90": 239200},
    {"soc": "17-2199", "title": "DevOps Engineer",                     "p10": 74950, "p25": 99260, "p50": 135000, "p75": 172530, "p90": 213140},
    {"soc": "17-2199", "title": "Site Reliability Engineer",           "p10": 79500, "p25": 105300, "p50": 142500, "p75": 184900, "p90": 226100},
    {"soc": "15-1299", "title": "Product Manager",                     "p10": 72150, "p25": 98420, "p50": 139900, "p75": 184290, "p90": 226200},
    {"soc": "11-9041", "title": "Engineering Manager",                 "p10": 101220, "p25": 134390, "p50": 170600, "p75": 213830, "p90": 239200},

    # --- Finance / Accounting ---
    {"soc": "13-2011", "title": "Accountant",                          "p10": 50440, "p25": 62610, "p50": 79880,  "p75": 105210, "p90": 137280},
    {"soc": "13-2011", "title": "Auditor",                             "p10": 50440, "p25": 62610, "p50": 79880,  "p75": 105210, "p90": 137280},
    {"soc": "13-2051", "title": "Financial Analyst",                   "p10": 58310, "p25": 76450, "p50": 99890,  "p75": 134000, "p90": 175720},
    {"soc": "13-2052", "title": "Personal Financial Advisor",          "p10": 47990, "p25": 66230, "p50": 99580,  "p75": 159680, "p90": 220930},
    {"soc": "13-1161", "title": "Market Research Analyst",             "p10": 39490, "p25": 53320, "p50": 74680,  "p75": 103430, "p90": 137200},
    {"soc": "13-2072", "title": "Loan Officer",                        "p10": 39160, "p25": 52470, "p50": 71640,  "p75": 105250, "p90": 143580},
    {"soc": "11-3031", "title": "Financial Manager",                   "p10": 78680, "p25": 105970, "p50": 156100, "p75": 211920, "p90": 239200},
    {"soc": "13-1081", "title": "Logistician",                         "p10": 49560, "p25": 62390, "p50": 79400,  "p75": 102450, "p90": 127380},

    # --- Consulting / Strategy / Ops ---
    {"soc": "13-1111", "title": "Management Consultant",               "p10": 54700, "p25": 71120, "p50": 99410,  "p75": 138440, "p90": 175740},
    {"soc": "13-1111", "title": "Strategy Analyst",                    "p10": 54700, "p25": 71120, "p50": 99410,  "p75": 138440, "p90": 175740},
    {"soc": "13-1082", "title": "Project Management Specialist",       "p10": 55580, "p25": 71170, "p50": 98580,  "p75": 128290, "p90": 158320},
    {"soc": "11-3121", "title": "Human Resources Manager",             "p10": 78710, "p25": 102290, "p50": 136350, "p75": 177790, "p90": 225610},
    {"soc": "13-1071", "title": "Human Resources Specialist",          "p10": 42610, "p25": 54900, "p50": 72910,  "p75": 98470,  "p90": 129210},
    {"soc": "13-1141", "title": "Compensation and Benefits Specialist","p10": 47210, "p25": 58790, "p50": 73900,  "p75": 95540,  "p90": 121580},
    {"soc": "13-1151", "title": "Training and Development Specialist", "p10": 37690, "p25": 49140, "p50": 65370,  "p75": 86900,  "p90": 114320},

    # --- Marketing / Sales / Business Dev ---
    {"soc": "11-2021", "title": "Marketing Manager",                   "p10": 78820, "p25": 108660, "p50": 158280, "p75": 212810, "p90": 239200},
    {"soc": "11-2022", "title": "Sales Manager",                       "p10": 67230, "p25": 97690, "p50": 138510, "p75": 195030, "p90": 239200},
    {"soc": "13-1161", "title": "Marketing Specialist",                "p10": 39490, "p25": 53320, "p50": 74680,  "p75": 103430, "p90": 137200},
    {"soc": "41-3091", "title": "Sales Representative",                "p10": 39860, "p25": 55820, "p50": 80650,  "p75": 115470, "p90": 162830},
    {"soc": "41-4012", "title": "Account Executive",                   "p10": 39860, "p25": 55820, "p50": 80650,  "p75": 115470, "p90": 162830},
    {"soc": "11-2011", "title": "Advertising Manager",                 "p10": 71020, "p25": 94430, "p50": 138760, "p75": 196900, "p90": 239200},

    # --- Design ---
    {"soc": "27-1024", "title": "Graphic Designer",                    "p10": 37750, "p25": 46390, "p50": 61300,  "p75": 80060,  "p90": 103050},
    {"soc": "27-1014", "title": "Product Designer",                    "p10": 55300, "p25": 72100, "p50": 97520,  "p75": 130150, "p90": 166300},
    {"soc": "27-1014", "title": "UX Designer",                         "p10": 55300, "p25": 72100, "p50": 97520,  "p75": 130150, "p90": 166300},
    {"soc": "27-1024", "title": "UI Designer",                         "p10": 42750, "p25": 55390, "p50": 75300,  "p75": 96060,  "p90": 121050},
    {"soc": "27-3043", "title": "Copywriter",                          "p10": 35870, "p25": 46160, "p50": 73690,  "p75": 101950, "p90": 142750},

    # --- Healthcare ---
    {"soc": "29-1141", "title": "Registered Nurse",                    "p10": 63720, "p25": 75130, "p50": 86070,  "p75": 103880, "p90": 132680},
    {"soc": "29-1171", "title": "Nurse Practitioner",                  "p10": 94530, "p25": 104200, "p50": 126260, "p75": 146960, "p90": 171210},
    {"soc": "29-1292", "title": "Dental Hygienist",                    "p10": 64350, "p25": 78640, "p50": 87530,  "p75": 101680, "p90": 113310},
    {"soc": "29-1051", "title": "Pharmacist",                          "p10": 99630, "p25": 123770, "p50": 136030, "p75": 151900, "p90": 165740},
    {"soc": "29-2055", "title": "Surgical Technologist",               "p10": 38990, "p25": 46310, "p50": 60610,  "p75": 75180,  "p90": 91190},
    {"soc": "29-1123", "title": "Physical Therapist",                  "p10": 72260, "p25": 84720, "p50": 99710,  "p75": 116790, "p90": 131290},
    {"soc": "29-1071", "title": "Physician Assistant",                 "p10": 88540, "p25": 111290, "p50": 130020, "p75": 150790, "p90": 176250},
    {"soc": "29-1216", "title": "General Internist",                   "p10": 119370, "p25": 184930, "p50": 242190, "p75": 239200, "p90": 239200},

    # --- Legal ---
    {"soc": "23-1011", "title": "Lawyer",                              "p10": 69650, "p25": 97770, "p50": 145760, "p75": 208000, "p90": 239200},
    {"soc": "23-2011", "title": "Paralegal",                           "p10": 37200, "p25": 47750, "p50": 60970,  "p75": 78900,  "p90": 98830 },

    # --- Education ---
    {"soc": "25-1099", "title": "Professor",                           "p10": 48170, "p25": 67240, "p50": 96910,  "p75": 139440, "p90": 208700},
    {"soc": "25-2021", "title": "Elementary School Teacher",           "p10": 46290, "p25": 53940, "p50": 63680,  "p75": 81410,  "p90": 100100},
    {"soc": "25-2031", "title": "High School Teacher",                 "p10": 47110, "p25": 55280, "p50": 65220,  "p75": 83140,  "p90": 102450},

    # --- Ops / Admin ---
    {"soc": "11-3012", "title": "Administrative Services Manager",     "p10": 57470, "p25": 78820, "p50": 106470, "p75": 138560, "p90": 176990},
    {"soc": "11-1021", "title": "General and Operations Manager",      "p10": 50990, "p25": 74870, "p50": 101280, "p75": 152960, "p90": 239200},
    {"soc": "11-1011", "title": "Chief Executive",                     "p10": 108850, "p25": 166710, "p50": 206420, "p75": 239200, "p90": 239200},
    {"soc": "43-6011", "title": "Executive Assistant",                 "p10": 45780, "p25": 54500, "p50": 67890,  "p75": 82960,  "p90": 99700 },
    {"soc": "43-4051", "title": "Customer Service Representative",     "p10": 30810, "p25": 36720, "p50": 45620,  "p75": 57950,  "p90": 71230 },
    {"soc": "13-1199", "title": "Business Operations Specialist",      "p10": 42210, "p25": 55280, "p50": 79590,  "p75": 107010, "p90": 140760},

    # --- Engineering (non-software) ---
    {"soc": "17-2141", "title": "Mechanical Engineer",                 "p10": 65510, "p25": 78510, "p50": 99510,  "p75": 125440, "p90": 157470},
    {"soc": "17-2071", "title": "Electrical Engineer",                 "p10": 70910, "p25": 89990, "p50": 114600, "p75": 143570, "p90": 175000},
    {"soc": "17-2051", "title": "Civil Engineer",                      "p10": 66860, "p25": 78390, "p50": 101620, "p75": 125620, "p90": 156000},
    {"soc": "17-2112", "title": "Industrial Engineer",                 "p10": 64580, "p25": 78730, "p50": 101140, "p75": 124970, "p90": 156890},

    # --- Supply chain / logistics ---
    {"soc": "11-3071", "title": "Logistics Manager",                   "p10": 65380, "p25": 89040, "p50": 124430, "p75": 167770, "p90": 212220},
    {"soc": "13-1081", "title": "Supply Chain Analyst",                "p10": 49560, "p25": 62390, "p50": 79400,  "p75": 102450, "p90": 127380},

    # --- Comms / Writing ---
    {"soc": "27-3031", "title": "Public Relations Specialist",         "p10": 40160, "p25": 51830, "p50": 71590,  "p75": 96360,  "p90": 129210},
    {"soc": "27-3042", "title": "Technical Writer",                    "p10": 52930, "p25": 66280, "p50": 85110,  "p75": 107260, "p90": 134850},
]


# Canonical aliases — maps common variants to a title we already have.
# Saves adding near-duplicate rows.
_ALIASES: dict[str, str] = {
    "swe":              "software developer",
    "software engineer": "software developer",
    "full stack engineer": "software developer",
    "full-stack engineer": "software developer",
    "backend engineer": "software developer",
    "frontend engineer": "web developer",
    "front-end engineer": "web developer",
    "ios engineer":     "mobile developer",
    "android engineer": "mobile developer",
    "ml engineer":      "machine learning engineer",
    "ai engineer":      "machine learning engineer",
    "data engineer":    "data scientist",
    "analyst":          "business operations specialist",
    "business analyst": "business operations specialist",
    "pm":               "product manager",
    "program manager":  "project management specialist",
    "tpm":              "project management specialist",
    "sre":              "site reliability engineer",
    "attorney":         "lawyer",
    "cpa":              "accountant",
    "rn":               "registered nurse",
    "np":               "nurse practitioner",
    "consultant":       "management consultant",
    "ceo":              "chief executive",
    "coo":              "chief executive",
    "founder":          "chief executive",
    "cto":              "computer and information systems manager",
    "cfo":              "financial manager",
    "ea":               "executive assistant",
    "ae":               "account executive",
    "bdr":              "sales representative",
    "sdr":              "sales representative",
}


def lookup_wage(role_title: str) -> Optional[Wage]:
    """
    Fuzzy-match a user's role title to a BLS occupation row. Returns
    None if no plausible match is found (caller should hide the
    benchmark card rather than guess).
    """
    if not role_title or not role_title.strip():
        return None
    q = role_title.strip().lower()

    # Strip common prefixes that don't change the occupation
    for prefix in ("senior ", "sr. ", "sr ", "junior ", "jr. ", "jr ",
                   "staff ", "principal ", "lead ", "head of ",
                   "vp of ", "vp, ", "director of ", "director, ",
                   "chief "):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break

    # Exact alias hit
    if q in _ALIASES:
        q = _ALIASES[q]

    # Exact title hit
    for row in BLS_WAGES:
        if row["title"].lower() == q:
            return row

    # Substring in either direction
    best: Optional[Wage] = None
    best_score = 0
    for row in BLS_WAGES:
        t = row["title"].lower()
        if q in t or t in q:
            score = min(len(q), len(t))
            if score > best_score:
                best = row
                best_score = score
    return best


def seniority_adjustment(years_experience: float, p50: int) -> int:
    """
    Map years of experience to a point on the BLS curve. This is our
    *estimate*, not a BLS figure — it tells the user roughly where
    they sit within the percentile band for their role. Linear model,
    clamped at 0..25 YOE.
    """
    y = max(0.0, min(25.0, float(years_experience or 0)))
    # Rough curve: entry ~0.7x median, 5 YOE ~median, 15+ YOE ~1.5x median.
    if y < 2:
        mult = 0.70 + (y / 2) * 0.15          # 0.70 → 0.85
    elif y < 5:
        mult = 0.85 + ((y - 2) / 3) * 0.15    # 0.85 → 1.00
    elif y < 10:
        mult = 1.00 + ((y - 5) / 5) * 0.25    # 1.00 → 1.25
    elif y < 15:
        mult = 1.25 + ((y - 10) / 5) * 0.15   # 1.25 → 1.40
    else:
        mult = 1.40 + ((y - 15) / 10) * 0.10  # 1.40 → 1.50
    return int(round(p50 * mult))


def percentile_from_estimate(wage: Wage, estimate: int) -> int:
    """
    Given our YOE-derived wage estimate, return the approximate
    percentile (10..90) the user's current market value sits at.
    """
    marks = [(10, wage["p10"]), (25, wage["p25"]), (50, wage["p50"]),
             (75, wage["p75"]), (90, wage["p90"])]
    if estimate <= marks[0][1]:
        return 10
    if estimate >= marks[-1][1]:
        return 90
    for i in range(len(marks) - 1):
        lo_p, lo_v = marks[i]
        hi_p, hi_v = marks[i + 1]
        if lo_v <= estimate <= hi_v:
            if hi_v == lo_v:
                return lo_p
            frac = (estimate - lo_v) / (hi_v - lo_v)
            return int(round(lo_p + frac * (hi_p - lo_p)))
    return 50
