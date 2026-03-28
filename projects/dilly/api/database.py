"""
Database stub — Supabase not available on this network.
All stores use file-based JSON instead. get_db() raises if anything calls it directly.
"""

from contextlib import contextmanager


@contextmanager
def get_db():
    raise RuntimeError("Supabase not available — using file-based storage")
    yield  # make contextmanager valid
