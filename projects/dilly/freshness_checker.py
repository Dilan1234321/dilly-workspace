"""
Freshness Checker — Verifies apply URLs are still live.
Runs HEAD requests on all active listings.
- 200 OK → update last_verified_at
- 404/410 → increment consecutive_failures
- 1 failure → status: possibly_stale
- 3 failures → status: closed
"""
import os, sys, time, urllib.request, ssl
import psycopg2
import psycopg2.extras

def get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except: pass
    return psycopg2.connect(
        host="dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

def check_url(url, timeout=10):
    """HEAD request to check if URL is alive. Returns status code or -1 for error."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except:
        return -1

def run():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id, apply_url, consecutive_failures FROM internships WHERE status = 'active' AND apply_url IS NOT NULL ORDER BY last_verified_at ASC NULLS FIRST LIMIT 200")
    listings = cur.fetchall()

    print(f"Checking {len(listings)} URLs...")
    alive = 0
    stale = 0
    closed = 0
    errors = 0

    for i, row in enumerate(listings):
        url = row["apply_url"]
        lid = row["id"]
        fails = row["consecutive_failures"] or 0

        status = check_url(url)

        if status in (200, 301, 302, 303, 307, 308):
            # Alive
            cur.execute("UPDATE internships SET last_verified_at = now(), consecutive_failures = 0 WHERE id = %s", (lid,))
            alive += 1
        elif status in (404, 410, 403):
            # Dead or forbidden
            fails += 1
            if fails >= 3:
                cur.execute("UPDATE internships SET status = 'closed', consecutive_failures = %s WHERE id = %s", (fails, lid))
                closed += 1
            else:
                new_status = 'possibly_stale' if fails >= 1 else 'active'
                cur.execute("UPDATE internships SET status = %s, consecutive_failures = %s WHERE id = %s", (new_status, fails, lid))
                stale += 1
        else:
            # Network error — don't penalize, just skip
            errors += 1

        if (i + 1) % 50 == 0:
            conn.commit()
            print(f"  [{i+1}/{len(listings)}] alive={alive} stale={stale} closed={closed} errors={errors}")

        time.sleep(0.3)  # Be polite

    conn.commit()

    cur.execute("SELECT status, COUNT(*) FROM internships GROUP BY status ORDER BY count DESC")
    print(f"\nDone! alive={alive} stale={stale} closed={closed} errors={errors}")
    print("\nStatus breakdown:")
    for r in cur.fetchall():
        print(f"  {r['status']}: {r['count']}")

    conn.close()

if __name__ == "__main__":
    run()
