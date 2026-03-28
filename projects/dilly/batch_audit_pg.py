import os, sys, json, glob, time, hashlib, re
sys.path.insert(0, '/Users/dilankochhar/.openclaw/workspace')

from projects.dilly.meridian_resume_auditor import MeridianResumeAuditor
from dilly_core.resume_parser import parse_resume
from dilly_core.auditor import run_audit
from projects.dilly.api.profile_store import get_profile, save_profile
import psycopg2

RESUME_DIR = 'assets/resumes'

# Build name->email map from ALL profiles
name_to_email = {}
for f in glob.glob('memory/dilly_profiles/*/profile.json'):
    with open(f) as fh:
        p = json.load(fh)
        name = (p.get('name') or '').lower().strip()
        email = p.get('email', '')
        if name and email:
            name_to_email[name] = email

MANUAL_MATCHES = {
    'Aldana CV 2025.pdf': 'aldana.flores@spartans.ut.edu',
    "Deng's current Resume .pdf": 'deng.bul@spartans.ut.edu',
    'Huntur Brock Resume.pdf': 'huntur.brockenbrough@spartans.ut.edu',
    'Tyler Resume Final.docx': 'tyler.smith4@spartans.ut.edu',
    'mattriversresume5.pdf': 'matthew.rivers@spartans.ut.edu',
}

def match_by_filename(filename):
    if filename in MANUAL_MATCHES:
        return MANUAL_MATCHES[filename]
    fn = filename.rsplit('.', 1)[0]
    fn = fn.replace('Resume','').replace('resume','').replace('RESUME','')
    fn = fn.replace('CV','').replace('cv','').replace('2025','').replace('2026','')
    fn = fn.replace('_',' ').replace('-',' ').replace('(',' ').replace(')',' ')
    fn = ' '.join(fn.split()).strip().lower()
    for pname, pemail in name_to_email.items():
        parts = pname.split()
        if len(parts) >= 2 and parts[0] in fn and parts[-1] in fn:
            return pemail
    return None

def get_first_last(name):
    """Extract first and last name, stripping middle names/initials."""
    parts = name.lower().split()
    # Remove single-letter initials like "M." or "A"
    parts = [p.rstrip('.') for p in parts]
    parts = [p for p in parts if len(p) > 1]
    if len(parts) >= 2:
        return (parts[0], parts[-1])
    return (parts[0], None) if parts else (None, None)

def match_by_parsed_name(parsed_name):
    """Match a name extracted from inside the resume against profiles."""
    if not parsed_name:
        return None
    pn = parsed_name.lower().strip()
    # Exact match
    if pn in name_to_email:
        return name_to_email[pn]
    # Smart match: compare first + last, ignoring middle names/initials
    p_first, p_last = get_first_last(pn)
    if not p_first or not p_last:
        return None
    for pname, pemail in name_to_email.items():
        prof_first, prof_last = get_first_last(pname)
        if not prof_first or not prof_last:
            continue
        # First + last match
        if p_first == prof_first and p_last == prof_last:
            return pemail
        # First initial + last name match
        if p_first[0] == prof_first[0] and p_last == prof_last:
            return pemail
    return None

# Connect to PostgreSQL
pw = open(os.path.expanduser('~/.dilly_db_pass')).read().strip()
conn = psycopg2.connect(host='dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com',
                         database='dilly', user='dilly_admin', password=pw, sslmode='require')

resumes = [r for r in os.listdir(RESUME_DIR) if r.lower().endswith(('.pdf', '.docx'))]
audited = 0
skipped = 0
errors = 0

print(f"{'='*60}")
print(f"Dilly Batch Resume Audit")
print(f"Resumes: {len(resumes)} | Profiles: {len(name_to_email)}")
print(f"{'='*60}\n")

for filename in sorted(resumes):
    filepath = os.path.join(RESUME_DIR, filename)

    # Step 1: Try matching by filename
    email = match_by_filename(filename)

    # Step 2: If no match, parse resume and match by extracted name
    if not email:
        try:
            auditor = MeridianResumeAuditor(filepath)
            if auditor.extract_text():
                parsed = parse_resume(auditor.raw_text, filename=filename)
                if parsed.name:
                    email = match_by_parsed_name(parsed.name)
                    if email:
                        print(f'  [NAME MATCH] {filename} -> parsed name "{parsed.name}" -> {email}')
                    else:
                        print(f'  SKIP (parsed name "{parsed.name}" not in profiles): {filename}')
                        skipped += 1
                        continue
                else:
                    print(f'  SKIP (no name extracted): {filename}')
                    skipped += 1
                    continue
            else:
                print(f'  SKIP (no text): {filename}')
                skipped += 1
                continue
        except Exception as e:
            print(f'  SKIP (parse error: {e}): {filename}')
            skipped += 1
            continue

    # Check if already audited
    profile = get_profile(email)
    if profile and profile.get('first_audit_snapshot'):
        print(f'  SKIP (already audited): {filename} -> {email}')
        skipped += 1
        continue

    print(f'  AUDITING: {filename} -> {email}...', end=' ', flush=True)

    try:
        auditor = MeridianResumeAuditor(filepath)
        if not auditor.extract_text():
            print('NO TEXT')
            skipped += 1
            continue

        text = auditor.raw_text
        parsed = parse_resume(text, filename=filename)
        result = run_audit(
            parsed.normalized_text or text,
            candidate_name=parsed.name,
            major=parsed.major,
            gpa=parsed.gpa,
            filename=filename,
        )

        smart = round(result.smart_score, 1)
        grit = round(result.grit_score, 1)
        build = round(result.build_score, 1)
        dilly = round((smart + grit + build) / 3, 2)

        # Save to JSON profile
        scores = {"smart": smart, "grit": grit, "build": build}
        save_profile(email, {
            "first_audit_snapshot": {"scores": scores, "ts": time.time()},
            "has_run_first_audit": True,
        })

        # Save to PostgreSQL
        cur = conn.cursor()
        cur.execute("""
            UPDATE students SET smart_score=%s, grit_score=%s, build_score=%s, dilly_score=%s,
            has_run_first_audit=true, updated_at=now()
            WHERE email=%s
        """, (smart, grit, build, dilly, email))
        conn.commit()

        print(f'S:{smart} G:{grit} B:{build} (D:{dilly})')
        audited += 1

    except Exception as e:
        print(f'ERROR: {e}')
        errors += 1

print(f'\n{"="*60}')
print(f'Batch complete: {audited} audited, {skipped} skipped, {errors} errors')

# Verify PostgreSQL
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM students WHERE smart_score IS NOT NULL")
print(f'Students with scores in DB: {cur.fetchone()[0]}')
conn.close()
