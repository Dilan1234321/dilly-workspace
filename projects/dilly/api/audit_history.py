"""
Per-user audit history.
MIGRATED: all functions now delegate to audit_history_pg (Postgres/Supabase).
"""

# Re-export from Postgres-backed module so all callers need zero changes.
from projects.dilly.api.audit_history_pg import (  # noqa: F401
    append_audit,
    get_audits,
    normalize_audit_id_key,
)
