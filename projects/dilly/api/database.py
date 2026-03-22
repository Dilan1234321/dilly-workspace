"""
Postgres connection via psycopg2. Reads SUPABASE_DB_URL from environment.
Used by the Postgres-backed store functions in *_pg.py modules.
"""

import os

import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

DATABASE_URL = os.environ.get("SUPABASE_DB_URL")


@contextmanager
def get_db():
    if not DATABASE_URL:
        raise RuntimeError("SUPABASE_DB_URL is not set.")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
