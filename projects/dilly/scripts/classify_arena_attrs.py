"""
Nightly batch: classify internships.ai_fluency and internships.role_cluster.

Runs against all active listings where either column is NULL.
Pure keyword-matching — zero LLM, zero external cost.

Usage:
    python scripts/classify_arena_attrs.py [--batch-size 500] [--dry-run]

Typical runtime: <30s for 20k rows on first run; <5s nightly for new listings.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
import os
import time

# ── Path setup ────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# scripts/ → dilly/ → projects/ → dilly-workspace/
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

import psycopg2
import psycopg2.extras
from projects.dilly.api.database import get_db
from projects.dilly.dilly_core.role_clusters import classify_title


# ── AI Fluency keyword sets ───────────────────────────────────────────────
# Checked against: LOWER(title + " " + stripped_description + " " + requirements)
# HIGH > MEDIUM > LOW > NONE — first tier that matches wins.

_HIGH_PATTERNS = re.compile(
    r"\b("
    r"llm|large language model|gpt-?4|gpt-?3|chatgpt|claude ai|gemini ai"
    r"|copilot|prompt engineer|langchain|langsmith|llamaindex|llama.?index"
    r"|openai api|anthropic api|vertex ai|amazon bedrock|google ai studio"
    r"|generative ai|gen.?ai|genai|fine.?tun(ing|ed)|rag\b"
    r"|retrieval.augmented|vector (database|store|db|search)"
    r"|embedding model|text embedding|ai agent|agentic (workflow|system)"
    r"|foundation model|frontier model|multimodal|mlops|llmops"
    r"|hugging.?face.*llm|diffusion model|stable diffusion"
    r")\b",
    re.IGNORECASE,
)

_MEDIUM_PATTERNS = re.compile(
    r"\b("
    r"machine learning|deep learning|neural network|natural language processing"
    r"|nlp\b|computer vision|tensorflow|pytorch|keras|scikit.?learn"
    r"|hugging.?face|transformers\b|bert\b|gpt\b|t5\b"
    r"|ai.powered|ai.assisted|ai.driven|ai tools?\b|ai model"
    r"|ai platform|automl|predictive model|recommendation (system|engine)"
    r"|reinforcement learning|gradient boost|xgboost|lightgbm"
    r"|feature engineer|model (training|inference|deployment|serving)"
    r"|model (evaluation|monitoring)|a/b testing.*ml|experiment.*ml"
    r")\b",
    re.IGNORECASE,
)

_LOW_PATTERNS = re.compile(
    r"\b("
    r"python|sql\b|r\b|scala|julia|pandas|numpy|spark\b|hadoop"
    r"|tableau|power bi|looker|dbt\b|airflow|dask|statistics"
    r"|data analysis|data visualization|business intelligence"
    r"|regression|classification|clustering"
    r")\b",
    re.IGNORECASE,
)

# Simple HTML stripper — handles both raw HTML and HTML-entity-encoded content.
_HTML_TAG_RE = re.compile(r"<[^>]{0,500}>")
_EXCESS_SPACE_RE = re.compile(r"\s{2,}")


def _strip_html(text: str) -> str:
    if not text:
        return ""
    # Unescape HTML entities (e.g. &lt; → <, &quot; → ")
    unescaped = html.unescape(text)
    # Strip tags
    stripped = _HTML_TAG_RE.sub(" ", unescaped)
    # Collapse whitespace
    return _EXCESS_SPACE_RE.sub(" ", stripped).strip()


def classify_ai_fluency(title: str, description: str, requirements: str) -> str:
    corpus = " ".join([
        (title or ""),
        _strip_html(description or ""),
        _strip_html(requirements or ""),
    ]).lower()

    if _HIGH_PATTERNS.search(corpus):
        return "high"
    if _MEDIUM_PATTERNS.search(corpus):
        return "medium"
    if _LOW_PATTERNS.search(corpus):
        return "low"
    return "none"


def run(batch_size: int = 500, dry_run: bool = False) -> dict[str, int]:
    stats = {
        "total_processed": 0,
        "ai_fluency_set": 0,
        "role_cluster_set": 0,
        "skipped_no_change": 0,
    }

    with get_db() as conn:
        # Fetch all active listings missing at least one attribute.
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT id, title, description, requirements
            FROM internships
            WHERE status = 'active'
              AND (ai_fluency IS NULL OR role_cluster IS NULL)
            ORDER BY created_at DESC
            LIMIT %s
        """, (batch_size * 20,))  # fetch up to 20 batches at once
        rows = cur.fetchall()

        if not rows:
            print("[classify_arena_attrs] Nothing to classify — all rows have attributes.", flush=True)
            return stats

        updates: list[tuple[str, str | None, str]] = []  # (ai_fluency, role_cluster, id)

        for row in rows:
            row_id = row["id"]
            title = row["title"] or ""
            desc = row["description"] or ""
            req = row["requirements"] or ""

            ai_fluency = classify_ai_fluency(title, desc, req)
            role_cluster = classify_title(title)

            updates.append((ai_fluency, role_cluster, row_id))
            stats["total_processed"] += 1
            if ai_fluency:
                stats["ai_fluency_set"] += 1
            if role_cluster:
                stats["role_cluster_set"] += 1

        if dry_run:
            print(f"[classify_arena_attrs] DRY RUN — would update {len(updates)} rows", flush=True)
            _print_sample(updates[:10])
            return stats

        # Batch update in chunks of batch_size
        update_cur = conn.cursor()
        for i in range(0, len(updates), batch_size):
            chunk = updates[i : i + batch_size]
            # Use executemany with individual UPDATE (psycopg2 doesn't support VALUES bulk update
            # with mixed NULL handling cleanly, so single-row updates are fine here)
            update_cur.executemany("""
                UPDATE internships
                SET ai_fluency   = COALESCE(ai_fluency, %s),
                    role_cluster = COALESCE(role_cluster, %s)
                WHERE id = %s
            """, chunk)

        print(
            f"[classify_arena_attrs] Done — processed={stats['total_processed']} "
            f"ai_fluency_set={stats['ai_fluency_set']} "
            f"role_cluster_set={stats['role_cluster_set']}",
            flush=True,
        )

    return stats


def _print_sample(updates: list[tuple[str, str | None, str]]) -> None:
    print("  Sample updates:")
    for ai_fluency, role_cluster, row_id in updates:
        print(f"    id={row_id[:8]}… ai_fluency={ai_fluency!r} role_cluster={role_cluster!r}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify internships.ai_fluency and role_cluster")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    t0 = time.time()
    stats = run(batch_size=args.batch_size, dry_run=args.dry_run)
    elapsed = round(time.time() - t0, 1)
    print(f"[classify_arena_attrs] Completed in {elapsed}s — {stats}", flush=True)
