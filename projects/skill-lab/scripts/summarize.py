"""
Per-video summary generation. Two sources, in order:

  1. 'chapters' — regex-parses the creator's own chapter timestamps from
                  the video description. Free. ~30-50% of high-quality
                  YouTube videos have them.
  2. 'ai'       — Haiku 4.5 pass over the transcript when no chapters
                  exist. ~$0.002 per video. Cached forever.

Summaries are stored on skill_lab_videos and served directly on the
video page — zero LLM at request time.

Run:
    YOUTUBE_API_KEY=... DATABASE_URL=... ANTHROPIC_API_KEY=... \\
    python3 projects/skill-lab/scripts/summarize.py

Environment flags:
    ONLY_CHAPTERS=1  Skip AI fallback entirely (purely free run)
    LIMIT=100        Cap number of videos per invocation
    COHORT="..."     Restrict to one cohort
"""
from __future__ import annotations

import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Iterator

import psycopg2


# ── Chapter parser ────────────────────────────────────────────────────────────

# Matches lines like:
#   "0:00 Intro"        "00:00 - Intro"      "0:00 | Intro"
#   "1:23:45 Something"
_CHAPTER_RE = re.compile(
    r"""^\s*
        (?:\[?)?                           # optional opening bracket
        (\d{1,2}:\d{2}(?::\d{2})?)         # (1) the timestamp — mm:ss or h:mm:ss
        (?:\]?)?                           # optional closing bracket
        \s*[-–—|:.)]?\s*                   # optional separator
        (.+?)                              # (2) the title
        \s*$
    """,
    re.VERBOSE,
)


def parse_chapters(description: str) -> list[str] | None:
    """
    Returns the chapter titles if the description contains a canonical
    chapter list (first timestamp is 0:00/0:00:00 and there are >=3
    timestamps in order), else None.
    """
    if not description:
        return None
    lines = description.splitlines()
    found: list[tuple[int, str]] = []
    for line in lines:
        m = _CHAPTER_RE.match(line)
        if not m:
            continue
        ts, title = m.group(1), m.group(2).strip()
        seconds = _ts_to_seconds(ts)
        if seconds is None:
            continue
        # Clean trailing noise like channel self-promo in brackets
        title = re.sub(r"\s*[—–-]\s*(subscribe|follow).*$", "", title, flags=re.IGNORECASE)
        if len(title) < 2 or len(title) > 160:
            continue
        found.append((seconds, title))

    # Must have at least 3 markers, must start at 0, must be monotonically increasing
    if len(found) < 3:
        return None
    if found[0][0] != 0:
        return None
    for a, b in zip(found, found[1:]):
        if b[0] <= a[0]:
            return None
    # Discard the very first "Intro"-style entry if it's generic — every
    # chapter list tends to have one, and it's not informative
    titles = [t for _, t in found]
    if titles and titles[0].strip().lower() in {"intro", "introduction", "start"}:
        titles = titles[1:]

    # Reject chapters that are substantively generic — e.g. "Number 6",
    # "Tip 1", "Point 2". These give a false sense of structure but no
    # actual information about what's in the video.
    if titles and _is_generic_sequence(titles):
        return None

    return titles[:10] if len(titles) >= 2 else None


_GENERIC_PREFIX_RE = re.compile(
    r"^\s*(number|tip|point|step|part|section|chapter|lesson|item)\s+\d+\.?$",
    re.IGNORECASE,
)


def _is_generic_sequence(titles: list[str]) -> bool:
    """True when most titles look like 'Number N' / 'Tip N' with no substance."""
    hits = sum(1 for t in titles if _GENERIC_PREFIX_RE.match(t.strip()))
    return hits >= max(3, len(titles) // 2)


def _ts_to_seconds(ts: str) -> int | None:
    parts = ts.split(":")
    try:
        parts_i = [int(p) for p in parts]
    except ValueError:
        return None
    if len(parts_i) == 2:
        m, s = parts_i
        return m * 60 + s
    if len(parts_i) == 3:
        h, m, s = parts_i
        return h * 3600 + m * 60 + s
    return None


def format_chapter_summary(titles: list[str]) -> str:
    """Bulleted, one title per line, no leading markers."""
    return "\n".join(f"- {t}" for t in titles)


# ── Transcript fetch + Haiku fallback ─────────────────────────────────────────


def fetch_transcript(video_id: str) -> str | None:
    """Fetches English captions. Returns None on any failure — we just skip."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        print("youtube-transcript-api not installed; AI fallback disabled", file=sys.stderr)
        return None
    try:
        data = YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])
    except Exception:
        return None
    # Join the text, cap length to ~7k tokens of input (~28k chars)
    text = " ".join((d.get("text") or "").strip() for d in data)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:28_000] if text else None


_HAIKU_PROMPT = """You are summarizing a YouTube learning video into a crisp, \
bulleted outline that helps a student decide whether to watch it.

Rules:
- 5 to 8 bullets, one concept each.
- No filler. No "the video discusses". Start each bullet with a noun phrase or verb.
- Keep each bullet under 90 characters.
- No markdown headers, no numbering, no colons at the start of bullets.
- Output ONLY the bullets, one per line, each starting with "- ".

Video title: {title}
Channel: {channel}

Transcript:
{transcript}
"""


def summarize_with_haiku(title: str, channel: str, transcript: str) -> str | None:
    """One Haiku 4.5 call. Returns the bulleted text or None on failure."""
    try:
        import anthropic
    except ImportError:
        print("anthropic SDK not installed; AI fallback disabled", file=sys.stderr)
        return None

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None

    client = anthropic.Anthropic(api_key=key)
    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": _HAIKU_PROMPT.format(
                title=title, channel=channel, transcript=transcript,
            )}],
        )
    except Exception as e:
        print(f"  ! Haiku call failed: {e}", file=sys.stderr)
        return None

    # Join content blocks
    text = ""
    for block in resp.content:
        if hasattr(block, "text"):
            text += block.text
    text = text.strip()
    # Normalize: ensure every non-empty line starts with "- "
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    cleaned = []
    for l in lines:
        if not l.startswith("-"):
            l = f"- {l.lstrip('•*· ').rstrip()}"
        if l in ("-", ""):
            continue
        cleaned.append(l)
    return "\n".join(cleaned) if cleaned else None


# ── DB iteration ──────────────────────────────────────────────────────────────


def videos_missing_summary(conn, only_cohort: str | None, limit: int) -> Iterator[tuple]:
    with conn.cursor() as cur:
        where = "summary IS NULL"
        params: list = []
        if only_cohort:
            where += " AND cohort = %s"
            params.append(only_cohort)
        cur.execute(
            f"""
            SELECT id, title, channel_title, cohort, description
              FROM skill_lab_videos
             WHERE {where}
             ORDER BY quality_score DESC
             LIMIT %s
            """,
            (*params, limit),
        )
        yield from cur.fetchall()


def save_summary(conn, video_id: str, summary: str, source: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE skill_lab_videos
               SET summary = %s,
                   summary_source = %s,
                   summary_generated_at = %s
             WHERE id = %s
            """,
            (summary, source, datetime.now(timezone.utc), video_id),
        )
    conn.commit()


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    only_chapters = os.environ.get("ONLY_CHAPTERS", "").strip() in {"1", "true", "yes"}
    limit = int(os.environ.get("LIMIT", "10000"))
    only_cohort = os.environ.get("COHORT") or None

    from_chapters = 0
    from_ai = 0
    skipped = 0

    conn = psycopg2.connect(db_url)
    try:
        for vid, title, channel, cohort, description in videos_missing_summary(
            conn, only_cohort, limit,
        ):
            chapters = parse_chapters(description or "")
            if chapters:
                summary = format_chapter_summary(chapters)
                save_summary(conn, vid, summary, "chapters")
                from_chapters += 1
                print(f"  ✓ [chapters] {title[:70]}")
                continue

            if only_chapters:
                skipped += 1
                continue

            transcript = fetch_transcript(vid)
            if not transcript or len(transcript) < 400:
                skipped += 1
                continue

            summary = summarize_with_haiku(title, channel, transcript)
            if not summary:
                skipped += 1
                continue

            save_summary(conn, vid, summary, "ai")
            from_ai += 1
            print(f"  ✓ [ai] {title[:70]}")
            # Polite rate-limit
            time.sleep(0.4)

        print()
        print(f"Done. chapters={from_chapters}  ai={from_ai}  skipped={skipped}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
