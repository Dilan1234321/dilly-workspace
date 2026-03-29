"""
Shared PostgreSQL connection helper for the Dilly API.
Uses psycopg2 with the same RDS credentials used across routers.

Usage:
    from projects.dilly.api.database import get_db

    with get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT ...")
        rows = cur.fetchall()
    # conn is committed on success, rolled back on exception, closed on exit.
"""

from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

_DEFAULT_HOST = "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"
_DEFAULT_DB = "dilly"
_DEFAULT_USER = "dilly_admin"


def _get_password() -> str:
    pw = os.environ.get("DILLY_DB_PASSWORD", "").strip()
    if pw:
        return pw
    try:
        return open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
    except Exception:
        return ""


@contextmanager
def get_db():
    """Yield a psycopg2 connection. Commits on clean exit, rolls back on exception."""
    conn = psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", _DEFAULT_HOST),
        database=_DEFAULT_DB,
        user=_DEFAULT_USER,
        password=_get_password(),
        sslmode="require",
        connect_timeout=10,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
