"""
Centralized configuration for the Dilly API.

All environment-variable lookups are collected here so that routers and
services import `config` instead of calling `os.getenv()` inline.
"""
import os
from dataclasses import dataclass, field
from typing import List


_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "https://trydilly.com",
    "https://www.trydilly.com",
]


def _parse_cors_origins() -> List[str]:
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return list(_DEFAULT_CORS_ORIGINS)


@dataclass
class DillyConfig:
    # ── API server ────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: List[str] = field(default_factory=list)

    # ── Auth / rate limits ────────────────────────────────────────────────
    rate_limit_sends: int = 5
    rate_limit_verifies: int = 10

    # ── Database ──────────────────────────────────────────────────────────
    db_host: str = ""
    db_password: str = ""

    # ── LLM keys ──────────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_base_url: str = ""
    anthropic_api_key: str = ""
    llm_model: str = "gpt-4o"
    llm_model_light: str = "gpt-4o-mini"
    use_llm: bool = False

    # ── Recruiter ─────────────────────────────────────────────────────────
    recruiter_api_key: str = ""

    # ── Files / reports ───────────────────────────────────────────────────
    reports_dir: str = ""
    report_expiry_days: int = 7
    max_upload_bytes: int = 5 * 1024 * 1024  # 5 MB

    # ── Internal / cron ───────────────────────────────────────────────────
    internal_api_key: str = ""
    cron_secret: str = ""

    # ── App URLs ──────────────────────────────────────────────────────────
    app_url: str = "https://trydilly.com"

    # ── ATS ────────────────────────────────────────────────────────────────
    ats_analysis_timeout_sec: float = 90.0

    # ── Dev flags ─────────────────────────────────────────────────────────
    dev_mode: bool = False
    dev_unlock: bool = True

    @classmethod
    def from_env(cls) -> "DillyConfig":
        """Build config from environment variables with sensible defaults."""
        workspace_root = os.path.normpath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        )
        return cls(
            cors_origins=_parse_cors_origins(),
            # Database
            db_host=os.environ.get(
                "DILLY_DB_HOST",
                "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
            ),
            db_password=os.environ.get("DILLY_DB_PASSWORD", ""),
            # LLM
            openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
            openai_base_url=os.environ.get("OPENAI_BASE_URL", ""),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            llm_model=os.environ.get("DILLY_LLM_MODEL", "") or "gpt-4o",
            llm_model_light=os.environ.get("DILLY_LLM_MODEL_LIGHT", "") or "gpt-4o-mini",
            use_llm=os.environ.get("DILLY_USE_LLM", "").strip().lower()
            in ("1", "true", "yes"),
            # Recruiter
            recruiter_api_key=os.environ.get("RECRUITER_API_KEY", ""),
            # Files
            reports_dir=os.path.join(workspace_root, "memory", "dilly_reports"),
            # Internal
            internal_api_key=os.environ.get("DILLY_INTERNAL_KEY", ""),
            cron_secret=os.environ.get("CRON_SECRET", ""),
            # App
            app_url=os.environ.get("DILLY_APP_URL", "https://trydilly.com"),
            # ATS
            ats_analysis_timeout_sec=float(
                os.environ.get("DILLY_ATS_ANALYSIS_TIMEOUT_SEC", "90")
            ),
            # Dev
            dev_mode=os.environ.get("DILLY_DEV", "").strip().lower()
            in ("1", "true", "yes"),
            dev_unlock=os.environ.get("DILLY_DEV_UNLOCK", "1").strip().lower()
            not in ("0", "false", "no"),
        )


# Singleton — imported as `from projects.dilly.api.config import config`
config = DillyConfig.from_env()
