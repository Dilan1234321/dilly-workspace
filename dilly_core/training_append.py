"""
Append a single audit result to training_data.json so every audited resume
automatically becomes a few-shot example for the LLM. Used by the API after each audit.
Best-effort: failures are logged but do not fail the audit request.
"""

import json
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Same path resolution as llm_auditor so we write to the file the LLM reads
def _get_training_data_path() -> Optional[str]:
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(os.getcwd(), "projects", "dilly", "prompts", "training_data.json"),
        os.path.join(os.getcwd(), "prompts", "training_data.json"),
        os.path.join(_root, "projects", "dilly", "prompts", "training_data.json"),
    ]
    env_path = os.environ.get("MERIDIAN_TRAINING_DATA")
    if env_path and os.path.isfile(env_path):
        return env_path
    for p in candidates:
        p = os.path.normpath(p)
        if os.path.isfile(p):
            return p
    # If file doesn't exist yet, use default write path (workspace)
    default = os.path.join(_root, "projects", "dilly", "prompts", "training_data.json")
    if os.path.isdir(os.path.dirname(default)):
        return default
    return os.path.join(os.getcwd(), "projects", "dilly", "prompts", "training_data.json")


MAX_EXCERPT_CHARS = int(os.environ.get("MERIDIAN_EXCERPT_CHARS", "2400"))
MAX_EXAMPLES = int(os.environ.get("MERIDIAN_TRAINING_MAX_EXAMPLES", "500"))


def append_audit_to_training(
    resume_text: str,
    result: "AuditorResult",
    filename: str = "upload.pdf",
) -> bool:
    """
    Upsert one audit (resume excerpt + scores + evidence) to training_data.json.
    One example per resume (by filename); re-auditing the same file replaces the
    existing example with the latest. Returns True if write succeeded, False otherwise.
    Does not raise.
    """
    path = _get_training_data_path()
    if not path:
        logger.warning("Meridian: training data path not found; skip append.")
        return False

    excerpt = (resume_text or "")[:MAX_EXCERPT_CHARS]
    if len((resume_text or "")) > MAX_EXCERPT_CHARS:
        excerpt += "..."

    evidence_smart = getattr(result, "evidence_smart", None) or []
    evidence_grit = getattr(result, "evidence_grit", None) or []
    evidence_build = getattr(result, "evidence_build", None) or []
    if isinstance(evidence_smart, list):
        evidence_smart = " ".join(evidence_smart[:3])
    if isinstance(evidence_grit, list):
        evidence_grit = " ".join(evidence_grit[:3])
    if isinstance(evidence_build, list):
        evidence_build = " ".join(evidence_build[:3])

    example = {
        "filename": filename or "upload.pdf",
        "resume_excerpt": excerpt,
        "candidate_name": getattr(result, "candidate_name", "Unknown"),
        "major": getattr(result, "major", "Unknown"),
        "track": getattr(result, "track", "Humanities"),
        "smart_score": getattr(result, "smart_score", 0),
        "grit_score": getattr(result, "grit_score", 0),
        "build_score": getattr(result, "build_score", 0),
        "final_score": getattr(result, "final_score", 0),
        "audit_findings": list(getattr(result, "audit_findings", [])),
        "evidence_smart": evidence_smart,
        "evidence_grit": evidence_grit,
        "evidence_build": evidence_build,
    }
    # Include personalized recommendations when present (LLM audit) so every new resume trains the model with full format
    recs = getattr(result, "recommendations", None)
    if recs:
        out_recs = []
        for r in recs[:8]:
            rec = {"type": r.get("type") or "generic", "title": (r.get("title") or "")[:120], "action": (r.get("action") or "")[:500]}
            if r.get("current_line"):
                rec["current_line"] = (r.get("current_line") or "")[:400]
            if r.get("suggested_line"):
                rec["suggested_line"] = (r.get("suggested_line") or "")[:400]
            if r.get("score_target"):
                rec["score_target"] = (r.get("score_target") or "")[:20]
            out_recs.append(rec)
        example["recommendations"] = out_recs

    try:
        if os.path.isfile(path):
            with open(path, "r") as f:
                data = json.load(f)
        else:
            data = {"examples": [], "count": 0}

        examples = data.get("examples") or []
        key = filename or "upload.pdf"
        examples = [e for e in examples if (e.get("filename") or "upload.pdf") != key]
        examples.append(example)
        if len(examples) > MAX_EXAMPLES:
            examples = examples[-MAX_EXAMPLES:]
        data["examples"] = examples
        data["count"] = len(examples)

        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
        logger.info("Meridian: upserted 1 audit to training_data (%s)", path)
        return True
    except Exception as e:
        logger.warning("Meridian: failed to append audit to training_data: %s", e)
        return False
