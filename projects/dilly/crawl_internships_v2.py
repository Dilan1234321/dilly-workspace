"""
Dilly Internship Crawler v2 — PostgreSQL + Multi-ATS
"""
import json, os, re, time, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
from typing import Optional
import psycopg2

DB_CONFIG = {
    "host": os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
    "database": os.environ.get("DILLY_DB_NAME", "dilly"),
    "user": os.environ.get("DILLY_DB_USER", "dilly_admin"),
    "password": os.environ.get("DILLY_DB_PASSWORD", "") or open(os.path.expanduser("~/.dilly_db_pass")).read().strip(),
    "sslmode": "require",
}

def get_db():
    return psycopg2.connect(**DB_CONFIG)

GREENHOUSE_COMPANIES = {
    # Working Greenhouse boards (verified 2026-03-25)
    'airbnb':('Airbnb','Tech'),'cloudflare':('Cloudflare','Tech'),
    'databricks':('Databricks','Tech'),'figma':('Figma','Tech'),
    'pinterest':('Pinterest','Tech'),'robinhood':('Robinhood','Finance'),
    'stripe':('Stripe','Tech'),'verkada':('Verkada','Tech'),
    'twilio':('Twilio','Tech'),'dropbox':('Dropbox','Tech'),
    'squarespace':('Squarespace','Tech'),'brex':('Brex','Finance'),
    'lyft':('Lyft','Consumer'),
    # Fixed slugs
    'doordashusa':('DoorDash','Consumer'),'scaleai':('Scale AI','Tech'),
    'mongodb':('MongoDB','Tech'),'block':('Block','Finance'),
    # New batch (verified 2026-03-25)
    'samsara':('Samsara','Tech'),'okta':('Okta','Tech'),
    'elastic':('Elastic','Tech'),'toast':('Toast','Tech'),
    'grammarly':('Grammarly','Tech'),'affirm':('Affirm','Finance'),
    'lucidmotors':('Lucid Motors','Tech'),'asana':('Asana','Tech'),
    'roblox':('Roblox','Media'),'riotgames':('Riot Games','Media'),
    # Healthcare / Health Tech (added 2026-03-26)
    'onemedical':('One Medical','Healthcare'),'zocdoc':('Zocdoc','Healthcare'),
    'cloverhealth':('Clover Health','Healthcare'),'omadahealth':('Omada Health','Healthcare'),
    'veracyte':('Veracyte','Healthcare'),'cerebral':('Cerebral','Healthcare'),
    # Education / EdTech (added 2026-03-26)
    '2u':('2U','Education'),'newsela':('Newsela','Education'),
    'clever':('Clever','Education'),'duolingo':('Duolingo','Education'),
    'khanacademy':('Khan Academy','Education'),'coursera':('Coursera','Education'),
    'masterclass':('MasterClass','Education'),
    # Finance (added 2026-03-26)
    'marqeta':('Marqeta','Finance'),'mercury':('Mercury','Finance'),
    'sofi':('SoFi','Finance'),
    # Nonprofit (added 2026-03-26)
    'codeforamerica':('Code for America','Nonprofit'),
    # Biotech / Life Sciences (added 2026-03-26)
    '10xgenomics':('10x Genomics','Biotech'),'natera':('Natera','Biotech'),
    'twistbioscience':('Twist Bioscience','Biotech'),'ginkgobioworks':('Ginkgo Bioworks','Biotech'),
    # Gov Tech (added 2026-03-26)
    'govini':('Govini','Government'),
    # More Tech + Finance (added 2026-03-26)
    'carta':('Carta','Finance'),'gusto':('Gusto','Tech'),
    'justworks':('Justworks','Tech'),'lattice':('Lattice','Tech'),
    'airtable':('Airtable','Tech'),'calendly':('Calendly','Tech'),
    'webflow':('Webflow','Tech'),'vercel':('Vercel','Tech'),
}

LEVER_COMPANIES = {
    "ramp":("Ramp","Finance"),"anduril":("Anduril","Tech"),"Netflix":("Netflix","Media"),
    "watershed":("Watershed","Tech"),"relativityspace":("Relativity Space","Tech"),
    "blueyonder":("Blue Yonder","Tech"),"linear":("Linear","Tech"),"vercel":("Vercel","Tech"),
    "flexport":("Flexport","Consumer"),"nerdwallet":("NerdWallet","Finance"),
    "masterclass":("MasterClass","Media"),"gusto":("Gusto","Tech"),"benchling":("Benchling","Healthcare"),
    "tempus":("Tempus","Healthcare"),"ziprecruiter":("ZipRecruiter","Tech"),"toast":("Toast","Tech"),
}

ASHBY_COMPANIES = {
    "ramp":("Ramp","Finance"),"notion":("Notion","Tech"),"linear":("Linear","Tech"),
    "vercel":("Vercel","Tech"),"retool":("Retool","Tech"),"mercury":("Mercury","Finance"),
    "ironclad":("Ironclad","Tech"),"algolia":("Algolia","Tech"),
}

SMARTRECRUITERS_COMPANIES = {
    "Visa":("Visa","Finance"),"Bosch":("Bosch","Tech"),"KPMG":("KPMG","Consulting"),
    "PwC":("PwC","Consulting"),"EY":("EY","Consulting"),"Accenture":("Accenture","Consulting"),
    "Deloitte":("Deloitte","Consulting"),
}

INTERN_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [r'\bintern\b',r'\binternship\b',r'\bco-op\b',r'\bsummer\s+\d{4}\b',r'\bsummer\s+analyst\b',r'\bsummer\s+associate\b',r'\bfellowship\b']]

NON_UNDERGRAD = [re.compile(p, re.IGNORECASE) for p in [r'\bPhD\b',r'\bPh\.D\b',r'\bMBA\b',r"\bMaster'?s\b",r'\bDoctoral\b',r'\bPost-?[Dd]oc\b',r'\bGraduate Student\b']]

SENIOR_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [r'\bSenior\b',r'\bSr\.?\b',r'\bStaff\b',r'\bPrincipal\b',r'\bDirector\b',r'\bVP\b',r'\bVice President\b',r'\bHead of\b',r'\bLead\b',r'\bManager(?!.*intern)\b',r'\b[5-9]\+? years\b',r'\b\d{2}\+? years\b']]

ENTRY_LEVEL_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r'\bentry[- ]level\b', r'\bnew grad\b', r'\bearly career\b',
    r'\brecent graduate\b', r'\bemerging talent\b', r'\bcampus\b',
    r'\bjunior\b', r'\bassociate\b(?!.*director)', r'\bcoordinator\b',
    r'\btrainee\b', r'\bapprenticeship\b', r'\bfellowship\b',
    r'\brotational\b', r'\brotation program\b', r'\b0-1 years\b',
    r'\bno experience\b', r'\bgraduate program\b',
    r'\brepresentative\b', r'\bspecialist\b', r'\bassistant\b',
    r'\banalyst\b', r'\bclerk\b', r'\btechnician\b',
    r'\badvisor\b', r'\btutor\b', r'\bmentor\b',
]]

PART_TIME_PATTERNS = [re.compile(p, re.IGNORECASE) for p in [
    r'\bcampus ambassador\b', r'\bbrand ambassador\b', r'\boffice assistant\b',
    r'\bstudent worker\b', r'\bwork[ -]study\b', r'\bpart[ -]time\b',
    r'\bcontent creator\b', r'\bsocial media\b(?=.*\b(assistant|creator|rep))',
]]

def classify_listing(title, description=""):
    """Classify a job listing. Returns: 'internship', 'entry_level', 'part_time', or None (skip)."""
    # Skip non-undergrad
    if any(p.search(title) for p in NON_UNDERGRAD):
        return None
    # Skip senior roles
    if any(p.search(title) for p in SENIOR_PATTERNS):
        return None
    # Check internship first (highest priority)
    if any(p.search(title) for p in INTERN_PATTERNS):
        return 'internship'
    # Check part-time
    if any(p.search(title) for p in PART_TIME_PATTERNS):
        return 'part_time'
    # Check entry-level
    if any(p.search(title) for p in ENTRY_LEVEL_PATTERNS):
        return 'entry_level'
    # Check description for entry-level signals
    desc_lower = (description or "")[:1000].lower()
    entry_desc_signals = ['entry level', 'new grad', 'recent graduate', 'early career',
        '0-1 years', 'no experience required', 'campus', 'university hiring',
        'early talent', 'emerging talent', 'start your career']
    if any(signal in desc_lower for signal in entry_desc_signals):
        return 'entry_level'
    return None  # Not student-appropriate based on keywords

def is_internship(title):
    """Backward compatible — returns True if listing is any student-appropriate type."""
    return classify_listing(title) is not None

def is_remote(location):
    loc = (location or "").lower()
    return "remote" in loc or "anywhere" in loc or "distributed" in loc

TAG_KEYWORDS = {"software":"Software Engineering","frontend":"Frontend","backend":"Backend","fullstack":"Full-Stack","full-stack":"Full-Stack","data science":"Data Science","data engineer":"Data Engineering","machine learning":"Machine Learning","ml ":"Machine Learning","ai ":"AI","product":"Product","design":"Design","ux":"UX","security":"Security","cloud":"Cloud","devops":"DevOps","mobile":"Mobile","ios":"iOS","android":"Android","finance":"Finance","analyst":"Analytics","marketing":"Marketing","sales":"Sales","operations":"Operations","research":"Research","hardware":"Hardware","consulting":"Consulting","quantitative":"Quantitative"}

def extract_tags(title, desc=""):
    text = f"{title} {desc[:500]}".lower()
    tags = []
    for kw, tag in TAG_KEYWORDS.items():
        if kw in text and tag not in tags:
            tags.append(tag)
    return tags[:6]

def strip_html(text):
    if not text: return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:5000]

def parse_location(location):
    if not location: return (None, None)
    parts = [p.strip() for p in location.split(",")]
    if len(parts) >= 2:
        return (parts[0], parts[-1].strip()[:2].upper() if len(parts[-1].strip()) <= 3 else parts[-1].strip())
    return (location.strip(), None)

def fetch_json(url, timeout=15, method="GET", data=None, headers=None):
    try:
        hdrs = {"User-Agent": "DillyBot/2.0 (internship-crawler)"}
        if headers: hdrs.update(headers)
        req = urllib.request.Request(url, headers=hdrs, method=method, data=data)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[WARN] {url}: {e}")
        return None

def crawl_greenhouse(slug, company_name):
    data = fetch_json(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true")
    if not data or not isinstance(data, dict): return []
    results = []
    for job in data.get("jobs", []):
        title = (job.get("title") or "").strip()
        desc = strip_html(job.get("content") or "")
        job_type = classify_listing(title, desc)
        if not job_type: continue
        location = (job.get("location") or {}).get("name", "") if isinstance(job.get("location"), dict) else str(job.get("location", ""))
        desc = strip_html(job.get("content") or "")
        depts = [d.get("name","") for d in (job.get("departments") or [])]
        posted = (job.get("updated_at") or job.get("first_published_at") or "")[:10]
        apply_url = job.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{job.get('id','')}"
        city, state = parse_location(location)
        results.append({"external_id":f"gh-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"greenhouse","team":depts[0] if depts else "","remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_lever(slug, company_name):
    data = fetch_json(f"https://api.lever.co/v0/postings/{slug}?mode=json")
    if not data or not isinstance(data, list): return []
    results = []
    for job in data:
        title = (job.get("text") or "").strip()
        job_type = classify_listing(title)
        if not job_type: continue
        cats = job.get("categories") or {}
        location = cats.get("location") or ""
        team = cats.get("team") or cats.get("department") or ""
        desc_parts = []
        for section in (job.get("lists") or []):
            desc_parts.append(section.get("text",""))
            for item in (section.get("content") or "").split("<li>"):
                clean = re.sub(r"<[^>]+>","",item).strip()
                if clean: desc_parts.append(clean)
        desc = " ".join(desc_parts)[:5000]
        if not desc: desc = strip_html(job.get("descriptionPlain") or job.get("description") or "")
        posted = ""
        if job.get("createdAt"):
            try: posted = time.strftime("%Y-%m-%d", time.gmtime(job["createdAt"]/1000))
            except: pass
        apply_url = job.get("hostedUrl") or job.get("applyUrl") or ""
        city, state = parse_location(location)
        results.append({"external_id":f"lever-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"lever","team":team,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_ashby(slug, company_name):
    payload = json.dumps({"operationName":"ApiJobBoardWithTeams","variables":{"organizationHostedJobsPageName":slug},"query":"query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { teams { name jobs { id title locationName employmentType descriptionHtml } } } }"}).encode("utf-8")
    data = fetch_json("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams", method="POST", data=payload, headers={"Content-Type":"application/json"})
    if not data: return []
    teams = ((data.get("data") or {}).get("jobBoard") or {}).get("teams") or []
    results = []
    for team_obj in teams:
        team_name = team_obj.get("name","")
        for job in (team_obj.get("jobs") or []):
            title = (job.get("title") or "").strip()
            desc = strip_html(job.get("descriptionHtml") or "")
            job_type = classify_listing(title, desc)
            if not job_type: continue
            location = job.get("locationName") or ""
            desc = strip_html(job.get("descriptionHtml") or "")
            apply_url = f"https://jobs.ashbyhq.com/{slug}/{job.get('id','')}"
            city, state = parse_location(location)
            results.append({"external_id":f"ashby-{slug}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city,"location_state":state,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":None,"source_ats":"ashby","team":team_name,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
    return results

def crawl_smartrecruiters(company_id, company_name):
    results = []
    offset = 0
    while True:
        data = fetch_json(f"https://api.smartrecruiters.com/v1/companies/{company_id}/postings?offset={offset}&limit=100")
        if not data or not isinstance(data, dict): break
        postings = data.get("content") or []
        if not postings: break
        for job in postings:
            title = (job.get("name") or "").strip()
            job_type = classify_listing(title)
            if not job_type: continue
            loc = job.get("location") or {}
            city = loc.get("city") or ""
            state = loc.get("region") or ""
            country = loc.get("country") or ""
            if country and country.upper() not in ("US","USA","UNITED STATES",""): continue
            location = f"{city}, {state}" if city and state else city or state or ""
            desc = ""
            try: desc = strip_html(job.get("jobAd",{}).get("sections",{}).get("jobDescription",{}).get("text",""))
            except: pass
            dept = ""
            try: dept = (job.get("department") or {}).get("label","")
            except: pass
            apply_url = job.get("ref") or f"https://jobs.smartrecruiters.com/{company_id}/{job.get('id','')}"
            posted = (job.get("releasedDate") or "")[:10]
            results.append({"external_id":f"sr-{company_id}-{job.get('id','')}","title":title,"company":company_name,"description":desc,"apply_url":apply_url,"location_city":city or None,"location_state":state or None,"work_mode":"remote" if is_remote(location) else "unknown","posted_date":posted or None,"source_ats":"smartrecruiters","team":dept,"remote":is_remote(location),"tags":extract_tags(title,desc),"job_type":job_type})
        if len(postings) < 100: break
        offset += 100
        time.sleep(0.3)
    return results

def ensure_company(cur, name, ats_type, industry):
    cur.execute("SELECT id FROM companies WHERE name = %s", (name,))
    row = cur.fetchone()
    if row: return row[0]
    cid = str(uuid.uuid4())
    cur.execute("INSERT INTO companies (id, name, ats_type, industry) VALUES (%s, %s, %s, %s) ON CONFLICT (name) DO NOTHING RETURNING id", (cid, name, ats_type, industry))
    result = cur.fetchone()
    return result[0] if result else cid

def write_listings(conn, listings, company_name, ats_type, industry):
    if not listings: return 0
    cur = conn.cursor()
    company_id = ensure_company(cur, company_name, ats_type, industry)
    inserted = 0
    for job in listings:
        try:
            cur.execute("""INSERT INTO internships (id, company_id, title, description, apply_url, location_city, location_state, work_mode, status, source_ats, external_id, tags, team, remote, is_internship, posted_date, job_type) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,true,%s,%s) ON CONFLICT (company_id, title) WHERE status = 'active' DO UPDATE SET description=EXCLUDED.description, apply_url=EXCLUDED.apply_url, updated_at=now()""",
                (str(uuid.uuid4()), company_id, job["title"], job.get("description",""), job.get("apply_url",""), job.get("location_city"), job.get("location_state"), job.get("work_mode","unknown"), job.get("source_ats",ats_type), job.get("external_id",""), json.dumps(job.get("tags",[])), job.get("team",""), job.get("remote",False), job.get("posted_date"), job.get("job_type","internship")))
            if cur.rowcount > 0: inserted += 1
        except Exception as e:
            print(f"    [ERR] {job.get('title','?')}: {e}")
    conn.commit()
    return inserted

# ── Auto-Classification ─────────────────────────────────────────────

def classify_unclassified(conn, api_key=None):
    """Classify any internships missing cohort_requirements."""
    if not api_key:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("[classify] No ANTHROPIC_API_KEY set, skipping classification")
        return 0
    
    cur = conn.cursor()
    cur.execute("""SELECT i.id, i.title, i.description, c.name FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE i.status='active' AND (i.cohort_requirements IS NULL OR i.cohort_requirements = '[]')""")
    listings = cur.fetchall()
    if not listings:
        print("[classify] No unclassified listings")
        return 0

    # Load cohort list
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
        from projects.dilly.academic_taxonomy import get_all_cohorts
        COHORT_LIST = get_all_cohorts()
    except:
        COHORT_LIST = ["Software Engineering & CS","Data Science & Analytics","Finance & Accounting","Marketing & Advertising","Management & Operations","Consulting & Strategy","Cybersecurity & IT","Healthcare & Clinical","Design & Creative Arts","Media & Communications","Law & Government","Education & Human Development","Social Sciences & Nonprofit","Entrepreneurship & Innovation","Life Sciences & Research","Physical Sciences & Math","Electrical & Computer Engineering","Mechanical & Aerospace Engineering","Civil & Environmental Engineering","Chemical & Biomedical Engineering","Biotech & Pharmaceutical","Economics & Public Policy"]
    
    SYSTEM = f'You classify job listings into cohorts and extract a quick glance summary. COHORTS: {json.dumps(COHORT_LIST)}. Pick 1-3 cohorts that best match this role. Also extract 3-4 key requirements as short bullet points (most important qualifications, skills, or requirements from the JD). Never use em dashes. ONLY JSON: {{"cohorts":[{{"cohort":"exact name"}}],"quick_glance":["bullet 1","bullet 2","bullet 3"]}}'

    print(f"[classify] Classifying {len(listings)} new internships...")
    scored = 0
    for iid, title, desc, company in listings:
        try:
            payload = json.dumps({'model':'claude-sonnet-4-20250514','max_tokens':300,'system':SYSTEM,
                'messages':[{'role':'user','content':f'Company:{company} Title:{title} Desc:{(desc or "")[:2000]}'}]}).encode()
            req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=payload,
                headers={'Content-Type':'application/json','x-api-key':api_key,'anthropic-version':'2023-06-01'}, method='POST')
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = json.loads(resp.read())['content'][0]['text'].strip()
            text = text.replace('```json','').replace('```','').strip()
            parsed = json.loads(text)
            cohorts = [c for c in parsed.get('cohorts',[]) if c.get('cohort') in COHORT_LIST]
            if not cohorts:
                cohorts = [{'cohort':'Social Sciences & Nonprofit'}]
            quick_glance = parsed.get('quick_glance', [])[:4]
            cur.execute('UPDATE internships SET cohort_requirements=%s, quick_glance=%s WHERE id=%s', (json.dumps(cohorts), json.dumps(quick_glance), iid))
            conn.commit()
            scored += 1
        except:
            pass
        time.sleep(0.3)
    print(f"[classify] Done: {scored}/{len(listings)} classified")
    return scored

def crawl_all():
    print("=" * 60)
    print("Dilly Internship Crawler v2 (PostgreSQL)")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)
    if not DB_CONFIG["password"]:
        DB_CONFIG["password"] = input("Enter RDS password: ")
    conn = get_db()
    total_found = 0
    total_new = 0

    print(f"\n[Greenhouse] Crawling {len(GREENHOUSE_COMPANIES)} companies...")
    for slug, (name, industry) in GREENHOUSE_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_greenhouse(slug, name)
            new = write_listings(conn, jobs, name, "greenhouse", industry)
            print(f"{len(jobs)} internships ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Lever] Crawling {len(LEVER_COMPANIES)} companies...")
    for slug, (name, industry) in LEVER_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_lever(slug, name)
            new = write_listings(conn, jobs, name, "lever", industry)
            print(f"{len(jobs)} internships ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[Ashby] Crawling {len(ASHBY_COMPANIES)} companies...")
    for slug, (name, industry) in ASHBY_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_ashby(slug, name)
            new = write_listings(conn, jobs, name, "ashby", industry)
            print(f"{len(jobs)} internships ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    print(f"\n[SmartRecruiters] Crawling {len(SMARTRECRUITERS_COMPANIES)} companies...")
    for slug, (name, industry) in SMARTRECRUITERS_COMPANIES.items():
        print(f"  {name} ({slug})...", end=" ", flush=True)
        try:
            jobs = crawl_smartrecruiters(slug, name)
            new = write_listings(conn, jobs, name, "smartrecruiters", industry)
            print(f"{len(jobs)} internships ({new} new)")
            total_found += len(jobs); total_new += new
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(0.3)

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
    total_active = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT company_id) FROM internships WHERE status = 'active'")
    total_companies = cur.fetchone()[0]
    print(f"\n{'=' * 60}")
    print(f"Crawl complete!")
    print(f"  Found:     {total_found} internships across all sources")
    print(f"  New:       {total_new} new listings added")
    print(f"  Active:    {total_active} total active internships")
    print(f"  Companies: {total_companies} companies with active listings")
    print(f"{'=' * 60}")
    conn.close()

if __name__ == "__main__":
    crawl_all()
