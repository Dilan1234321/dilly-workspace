"""Thin re-export shim so the API layer can import the threat report
content without digging into dilly_core. Keeps imports short in routers."""

from dilly_core.ai_threat_report import (  # noqa: F401
    ROLE_THREAT_REPORT,
    lookup,
    available_roles,
)
