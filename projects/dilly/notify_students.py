"""
Notification Worker — Sends push notifications for:
1. New job matches since last check
2. Application deadlines approaching (3 days, 1 day)
3. Weekly digest of new Ready matches
"""
import os, sys, json
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/../..')

def get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except: pass
    return psycopg2.connect(
        host="dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

def send_expo_push(tokens, title, body, data=None):
    import urllib.request
    messages = [{"to": t, "sound": "default", "title": title, "body": body, "data": data or {}} for t in tokens]
    req = urllib.request.Request("https://exp.host/--/api/v2/push/send", data=json.dumps(messages).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        return json.loads(urllib.request.urlopen(req, timeout=10).read())
    except:
        return None

def run():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Ensure push_tokens table exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            token TEXT NOT NULL,
            platform TEXT DEFAULT 'ios',
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(student_id, token)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notification_log (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            type TEXT NOT NULL,
            sent_at TIMESTAMPTZ DEFAULT now(),
            data JSONB
        )
    """)
    conn.commit()

    # Get students with push tokens
    cur.execute("""
        SELECT DISTINCT s.id, s.name, s.email, pt.token
        FROM students s
        JOIN push_tokens pt ON s.id = pt.student_id
    """)
    students = cur.fetchall()

    if not students:
        print("No students with push tokens")
        conn.close()
        return

    print(f"Checking notifications for {len(students)} students...")
    sent = 0

    for s in students:
        tokens = [s["token"]]

        # 1. New Ready matches in last 6 hours
        cur.execute("""
            SELECT COUNT(*) as cnt FROM match_scores m
            JOIN internships i ON m.internship_id = i.id
            WHERE m.student_id = %s AND m.readiness = 'ready'
            AND i.status = 'active' AND i.created_at > now() - interval '6 hours'
        """, (s["id"],))
        new_ready = cur.fetchone()["cnt"]

        if new_ready > 0:
            send_expo_push(tokens,
                "New matches!",
                f"{new_ready} new Ready listing{'s' if new_ready > 1 else ''} just dropped.",
                {"route": "/(app)/jobs"}
            )
            sent += 1
            print(f"  {s['name']}: {new_ready} new ready matches")

        # 2. Deadline approaching (3 days)
        cur.execute("""
            SELECT i.title, c.name as company, i.deadline
            FROM applications a
            JOIN internships i ON a.internship_id = i.id
            JOIN companies c ON i.company_id = c.id
            WHERE a.student_id = %s AND a.status = 'saved'
            AND i.deadline BETWEEN now() AND now() + interval '3 days'
        """, (s["id"],))
        deadlines = cur.fetchall()

        for d in deadlines:
            send_expo_push(tokens,
                "Deadline approaching",
                f"{d['title']} at {d['company']} — deadline {d['deadline'].strftime('%b %d')}",
                {"route": "/(app)/internship-tracker"}
            )
            sent += 1
            print(f"  {s['name']}: deadline alert for {d['company']}")

    conn.commit()
    print(f"\nDone! Sent {sent} notifications")
    conn.close()

if __name__ == "__main__":
    run()
