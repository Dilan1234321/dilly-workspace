"""
LLM fallback for failed field extraction.
"""
import json
import re
from typing import Any, Dict, List, Optional


def _llm_extract_name(text: str) -> Optional[str]:
    """Extract name from first 500 chars using LLM if available."""
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion
        if not is_llm_available():
            return None
        prompt = f"""Extract only the candidate's full name from this resume header. Return just the name, nothing else. If no name found, return null.
Text:
{text[:500]}"""
        out = get_chat_completion(
            "You extract resume fields. Return only the requested value, no markdown.",
            prompt,
            model="claude-sonnet-4-20250514",
            temperature=0,
            max_tokens=50,
        )
        if out:
            out = out.strip().strip('"').strip("'")
            if out.lower() in ("null", "none", "n/a", ""):
                return None
            return out[:80]
    except Exception:
        pass
    return None


def llm_fallback_extraction(
    section_text: str,
    failed_fields: List[str],
) -> Dict[str, Any]:
    """
    Call LLM to extract failed fields. Returns dict of field -> value.
    """
    if not failed_fields:
        return {}
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion
        if not is_llm_available():
            return {}
        prompt = f"""Extract only what is explicitly present. Return null for missing fields. Return JSON only, no markdown.
Failed fields to extract: {', '.join(failed_fields)}
Text (max 2000 chars):
{section_text[:2000]}"""
        out = get_chat_completion(
            "Extract resume fields. Return JSON only. No markdown fences.",
            prompt,
            model="claude-sonnet-4-20250514",
            temperature=0,
            max_tokens=400,
        )
        if not out:
            return {}
        out = re.sub(r"^```\w*\n?", "", out)
        out = re.sub(r"\n?```$", "", out)
        return json.loads(out)
    except Exception:
        return {}
