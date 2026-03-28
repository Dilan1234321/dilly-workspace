"""
Push Notifications — register tokens, send match alerts, deadline reminders.
POST /v2/push/register  — save push token for a student
GET  /v2/push/test      — send a test notification
"""
import os, sys, json, uuid

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras
import urllib.request

from projects.dilly.api import deps

router = APIRouter(tags=["push"])

def _get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except: pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

class RegisterPushRequest(BaseModel):
    push_token: str
    platform: Optional[str] = "ios"

@router.post("/v2/push/register")
async def register_push_token(request: Request, body: RegisterPushRequest):
    """Register an Expo push token for the authenticated student."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401)

    conn = _get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")

    # Upsert push token
    cur.execute("""
        CREATE TABLE IF NOT EXISTS push_tokens (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL REFERENCES students(id),
            token TEXT NOT NULL,
            platform TEXT DEFAULT 'ios',
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(student_id, token)
        )
    """)
    cur.execute("""
        INSERT INTO push_tokens (id, student_id, token, platform)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (student_id, token) DO NOTHING
    """, (str(uuid.uuid4()), student[0], body.push_token, body.platform))
    conn.commit()
    conn.close()

    return {"ok": True}


def send_expo_push(tokens: list, title: str, body: str, data: dict = None):
    """Send push notification via Expo's push API."""
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for token in tokens
    ]

    req = urllib.request.Request(
        "https://exp.host/--/api/v2/push/send",
        data=json.dumps(messages).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}


@router.get("/v2/push/test")
async def test_push(request: Request):
    """Send a test notification to the authenticated user."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()

    conn = _get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT pt.token FROM push_tokens pt
        JOIN students s ON pt.student_id = s.id
        WHERE s.email = %s
    """, (email,))
    tokens = [r[0] for r in cur.fetchall()]
    conn.close()

    if not tokens:
        return {"error": "No push tokens registered"}

    result = send_expo_push(
        tokens,
        "Dilly",
        "New internships match your profile! 3 new Ready listings.",
        {"route": "/(app)/jobs"}
    )
    return {"sent_to": len(tokens), "result": result}
