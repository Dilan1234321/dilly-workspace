"""
Nightly YouTube ingest for Skill Lab.

- Reads search queries from skill_lab_cohort_queries.
- Calls YouTube Data API v3 (search.list + videos.list + channels.list) for each
  supported language (SEARCH_LANGUAGES).
- Captures each video's language (snippet.defaultAudioLanguage ->
  snippet.defaultLanguage -> fallback to the search language).
- Scores with a weighted algorithmic model. Applies cohort keyword allowlist +
  denylist so videos that don't match the topic are dropped entirely.
- Upserts the top-N per (cohort, language) into skill_lab_videos.

Run:
    YOUTUBE_API_KEY=... DATABASE_URL=... python projects/skill-lab/scripts/ingest.py
"""
from __future__ import annotations

import math
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

import psycopg2
import psycopg2.extras
import requests

YT_API = "https://www.googleapis.com/youtube/v3"
TOP_N_PER_COHORT_LANG = 50           # keep top N per (cohort, language) combo
MAX_RESULTS_PER_QUERY = 25
MIN_DURATION_SEC = 180
MAX_DURATION_SEC = 4 * 3600
MIN_RELEVANCE = 0.15                 # drop videos below this cohort-keyword match score

# Languages we can ingest for. Keep this list in sync with lib/i18n.ts.
# YouTube quota is 10k units/day. search.list costs 100 units per call, so
# ingesting all 6 langs × 79 queries (= ~47k units) in one run is over budget.
# Default: ingest only LANGUAGES env var (comma-separated ISO codes), falling
# back to English-only. Run different languages on different days via cron.
ALL_LANGUAGES: list[tuple[str, str]] = [
    ("en", "en"),
    ("es", "es"),
    ("pt", "pt"),
    ("hi", "hi"),
    ("fr", "fr"),
    ("zh", "zh"),
]

def resolve_languages() -> list[tuple[str, str]]:
    env = (os.environ.get("LANGUAGES") or "").strip()
    if not env:
        return [("en", "en")]
    wanted = {c.strip().lower() for c in env.split(",") if c.strip()}
    return [(code, rel) for code, rel in ALL_LANGUAGES if code in wanted]


@dataclass
class VideoRow:
    id: str
    title: str
    description: str
    channel_id: str
    channel_title: str
    cohort: str
    duration_sec: int
    view_count: int
    like_count: int
    comment_count: int
    subscriber_count: int
    published_at: datetime
    thumbnail_url: str
    quality_score: float
    language: str


# ── YouTube API helpers ────────────────────────────────────────────────────────

def yt_get(path: str, params: dict, key: str) -> dict:
    r = requests.get(f"{YT_API}/{path}", params={**params, "key": key}, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"YouTube {path} {r.status_code}: {r.text[:200]}")
    return r.json()


def search_video_ids(query: str, relevance_lang: str, key: str) -> list[str]:
    data = yt_get(
        "search",
        {
            "part": "id",
            "q": query,
            "type": "video",
            "videoDuration": "medium",
            "videoEmbeddable": "true",
            "relevanceLanguage": relevance_lang,
            "maxResults": MAX_RESULTS_PER_QUERY,
            "order": "relevance",
        },
        key,
    )
    return [it["id"]["videoId"] for it in data.get("items", []) if "videoId" in it.get("id", {})]


def fetch_video_details(ids: list[str], key: str) -> list[dict]:
    if not ids:
        return []
    data = yt_get(
        "videos",
        {"part": "snippet,contentDetails,statistics", "id": ",".join(ids), "maxResults": 50},
        key,
    )
    return data.get("items", [])


def fetch_channel_subs(channel_ids: Iterable[str], key: str) -> dict[str, int]:
    ids = list({cid for cid in channel_ids if cid})
    out: dict[str, int] = {}
    for i in range(0, len(ids), 50):
        batch = ids[i : i + 50]
        data = yt_get("channels", {"part": "statistics", "id": ",".join(batch)}, key)
        for it in data.get("items", []):
            cid = it["id"]
            out[cid] = int(it.get("statistics", {}).get("subscriberCount", 0) or 0)
    return out


# ── Parsing + scoring ──────────────────────────────────────────────────────────

def parse_iso8601_duration(s: str) -> int:
    if not s or not s.startswith("PT"):
        return 0
    hours = minutes = seconds = 0
    num = ""
    for ch in s[2:]:
        if ch.isdigit():
            num += ch
        else:
            if ch == "H": hours = int(num or 0)
            elif ch == "M": minutes = int(num or 0)
            elif ch == "S": seconds = int(num or 0)
            num = ""
    return hours * 3600 + minutes * 60 + seconds


def duration_sanity(sec: int) -> float:
    if sec < MIN_DURATION_SEC or sec > MAX_DURATION_SEC:
        return 0.0
    if 480 <= sec <= 2700:
        return 1.0
    if sec < 480:
        return max(0.4, sec / 480.0)
    return max(0.4, 1.0 - (sec - 2700) / (MAX_DURATION_SEC - 2700))


def days_since(published: datetime) -> float:
    return max(1.0, (datetime.now(timezone.utc) - published).total_seconds() / 86400.0)


def normalize_lang(raw: str | None, fallback: str) -> str:
    if not raw:
        return fallback
    code = raw.strip().lower().split("-")[0]  # 'en-US' -> 'en', 'zh-CN' -> 'zh'
    return code or fallback


def cohort_relevance(title: str, description: str, keywords: list[tuple[str, float]]) -> float:
    """0..1+. Sum of matched keyword weights, normalized. >1 means very strong match."""
    if not keywords:
        return 0.5  # no keywords seeded? assume neutral
    text = f"{title}\n{description}".lower()
    matched = 0.0
    max_possible = 0.0
    for kw, w in keywords:
        max_possible += w
        if kw.lower() in text:
            matched += w
    # Normalize against a target of ~3 average-weight matches
    target = min(3.0, max_possible)
    return round(matched / max(target, 1.0), 3) if target else 0.0


def is_denied(title: str, description: str, denylist: set[str]) -> bool:
    text = f"{title}\n{description}".lower()
    return any(phrase in text for phrase in denylist)


def score_video(
    view_count: int, like_count: int, comment_count: int, subscriber_count: int,
    duration_sec: int, published_at: datetime, query_weight: float, relevance: float,
) -> float:
    age_days = days_since(published_at)
    views_per_day = view_count / age_days
    view_velocity = math.log10(views_per_day + 1.0) / 5.0
    engagement = (like_count + comment_count * 2) / max(1, view_count)
    engagement = min(1.0, engagement * 40.0)
    channel_authority = math.log10(subscriber_count + 1.0) / 7.0
    duration_fit = duration_sanity(duration_sec)
    recency = max(0.25, 1.0 - min(1.0, age_days / (5 * 365)))

    raw = (
        0.25 * view_velocity
        + 0.18 * engagement
        + 0.18 * channel_authority
        + 0.15 * duration_fit
        + 0.08 * recency
        + 0.16 * min(1.0, relevance)      # relevance now directly lifts score
    )
    return round(max(0.0, min(1.0, raw)) * query_weight * 100.0, 2)


def to_row(
    item: dict, cohort: str, subs: int, query_weight: float,
    keywords: list[tuple[str, float]], denylist: set[str],
    fallback_lang: str,
) -> VideoRow | None:
    vid = item.get("id")
    snippet = item.get("snippet", {})
    content = item.get("contentDetails", {})
    stats = item.get("statistics", {})
    if not vid or not snippet:
        return None

    duration_sec = parse_iso8601_duration(content.get("duration", ""))
    if duration_sec < MIN_DURATION_SEC or duration_sec > MAX_DURATION_SEC:
        return None

    title = snippet.get("title", "") or ""
    description = (snippet.get("description") or "")

    if is_denied(title, description, denylist):
        return None
    relevance = cohort_relevance(title, description, keywords)
    if relevance < MIN_RELEVANCE:
        return None

    published_at = datetime.fromisoformat(
        snippet.get("publishedAt", "1970-01-01T00:00:00Z").replace("Z", "+00:00")
    )
    view_count = int(stats.get("viewCount", 0) or 0)
    like_count = int(stats.get("likeCount", 0) or 0)
    comment_count = int(stats.get("commentCount", 0) or 0)
    thumbs = snippet.get("thumbnails", {})
    thumb_url = (
        thumbs.get("high", {}).get("url")
        or thumbs.get("medium", {}).get("url")
        or thumbs.get("default", {}).get("url")
        or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
    )
    language = normalize_lang(
        snippet.get("defaultAudioLanguage") or snippet.get("defaultLanguage"),
        fallback_lang,
    )

    quality = score_video(
        view_count, like_count, comment_count, subs,
        duration_sec, published_at, query_weight, relevance,
    )

    return VideoRow(
        id=vid,
        title=title[:500],
        description=description[:2000],
        channel_id=snippet.get("channelId", ""),
        channel_title=snippet.get("channelTitle", "")[:200],
        cohort=cohort,
        duration_sec=duration_sec,
        view_count=view_count,
        like_count=like_count,
        comment_count=comment_count,
        subscriber_count=subs,
        published_at=published_at,
        thumbnail_url=thumb_url,
        quality_score=quality,
        language=language,
    )


# ── DB ─────────────────────────────────────────────────────────────────────────

def upsert_videos(conn, rows: list[VideoRow]) -> None:
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO skill_lab_videos (
                id, title, description, channel_id, channel_title, cohort,
                duration_sec, view_count, like_count, comment_count,
                subscriber_count, published_at, thumbnail_url, quality_score,
                language, fetched_at
            ) VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                channel_title = EXCLUDED.channel_title,
                cohort = EXCLUDED.cohort,
                duration_sec = EXCLUDED.duration_sec,
                view_count = EXCLUDED.view_count,
                like_count = EXCLUDED.like_count,
                comment_count = EXCLUDED.comment_count,
                subscriber_count = EXCLUDED.subscriber_count,
                published_at = EXCLUDED.published_at,
                thumbnail_url = EXCLUDED.thumbnail_url,
                quality_score = EXCLUDED.quality_score,
                language = EXCLUDED.language,
                fetched_at = NOW()
            """,
            [
                (
                    r.id, r.title, r.description, r.channel_id, r.channel_title, r.cohort,
                    r.duration_sec, r.view_count, r.like_count, r.comment_count,
                    r.subscriber_count, r.published_at, r.thumbnail_url, r.quality_score,
                    r.language, datetime.now(timezone.utc),
                )
                for r in rows
            ],
        )
    conn.commit()


def prune_per_cohort_language(conn, cohort: str, lang: str, keep_top: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM skill_lab_videos
             WHERE cohort = %s AND language = %s
               AND id NOT IN (
                   SELECT id FROM skill_lab_videos
                    WHERE cohort = %s AND language = %s
                    ORDER BY quality_score DESC
                    LIMIT %s
               )
            """,
            (cohort, lang, cohort, lang, keep_top),
        )
    conn.commit()


def load_queries(conn) -> dict[str, list[tuple[str, float]]]:
    with conn.cursor() as cur:
        cur.execute("SELECT cohort, query, weight FROM skill_lab_cohort_queries")
        rows = cur.fetchall()
    out: dict[str, list[tuple[str, float]]] = {}
    for cohort, query, weight in rows:
        out.setdefault(cohort, []).append((query, float(weight)))
    return out


def load_cohort_keywords(conn) -> dict[str, list[tuple[str, float]]]:
    with conn.cursor() as cur:
        cur.execute("SELECT cohort, keyword, weight FROM skill_lab_cohort_keywords")
        rows = cur.fetchall()
    out: dict[str, list[tuple[str, float]]] = {}
    for cohort, kw, w in rows:
        out.setdefault(cohort, []).append((kw, float(w)))
    return out


def load_denylist(conn) -> dict[str, set[str]]:
    """Returns cohort -> set(phrases). Includes the global denylist in every entry."""
    with conn.cursor() as cur:
        cur.execute("SELECT phrase FROM skill_lab_global_denylist")
        globals_ = {p.lower() for (p,) in cur.fetchall()}
        cur.execute("SELECT cohort, phrase FROM skill_lab_cohort_denylist")
        rows = cur.fetchall()
    by_cohort: dict[str, set[str]] = {}
    for cohort, phrase in rows:
        by_cohort.setdefault(cohort, set()).add(phrase.lower())
    # Merge globals into every cohort (plus a default for cohorts with no overrides)
    return {"__global__": globals_, **{c: (s | globals_) for c, s in by_cohort.items()}}


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    key = os.environ.get("YOUTUBE_API_KEY")
    db_url = os.environ.get("DATABASE_URL")
    if not key: print("YOUTUBE_API_KEY not set", file=sys.stderr); return 1
    if not db_url: print("DATABASE_URL not set", file=sys.stderr); return 1

    languages = resolve_languages()
    print(f"Ingesting languages: {[l for l, _ in languages]}")

    conn = psycopg2.connect(db_url)
    try:
        queries_by_cohort = load_queries(conn)
        keywords_by_cohort = load_cohort_keywords(conn)
        deny = load_denylist(conn)
        global_deny = deny["__global__"]

        if not queries_by_cohort:
            print("No cohort queries seeded.", file=sys.stderr)
            return 1

        for cohort, queries in queries_by_cohort.items():
            keywords = keywords_by_cohort.get(cohort, [])
            denylist = deny.get(cohort, global_deny)
            print(f"[{cohort}] {len(queries)} queries, {len(keywords)} keywords")

            for lang_code, relevance_lang in languages:
                all_items: list[tuple[dict, float]] = []
                for q, weight in queries:
                    try:
                        ids = search_video_ids(q, relevance_lang, key)
                        for item in fetch_video_details(ids, key):
                            all_items.append((item, weight))
                    except Exception as e:
                        print(f"  ! {lang_code} '{q}' failed: {e}", file=sys.stderr)
                    time.sleep(0.2)

                if not all_items:
                    continue

                channel_ids = {i.get("snippet", {}).get("channelId", "") for i, _ in all_items}
                subs_by_channel = fetch_channel_subs(channel_ids, key)

                rows: list[VideoRow] = []
                for item, weight in all_items:
                    cid = item.get("snippet", {}).get("channelId", "")
                    subs = subs_by_channel.get(cid, 0)
                    row = to_row(item, cohort, subs, weight, keywords, denylist, lang_code)
                    if row:
                        rows.append(row)

                # Dedupe by id across queries — keep highest score
                best_by_id: dict[str, VideoRow] = {}
                for r in rows:
                    prev = best_by_id.get(r.id)
                    if not prev or r.quality_score > prev.quality_score:
                        best_by_id[r.id] = r

                # Keep top N per language for this cohort
                lang_rows = sorted(
                    (r for r in best_by_id.values() if r.language == lang_code),
                    key=lambda r: r.quality_score, reverse=True,
                )[:TOP_N_PER_COHORT_LANG]

                # Also include videos whose reported language differs but matched the search
                # (e.g. a Spanish-search result that YouTube labeled 'en'); keep those in their
                # actual language bucket
                other_rows = sorted(
                    (r for r in best_by_id.values() if r.language != lang_code),
                    key=lambda r: r.quality_score, reverse=True,
                )[: TOP_N_PER_COHORT_LANG // 4]

                combined = lang_rows + other_rows
                print(f"  [{lang_code}] upserting {len(combined)} rows "
                      f"({len(lang_rows)} in-lang, {len(other_rows)} other-lang)")
                upsert_videos(conn, combined)

            # Prune after all language passes for this cohort
            for lang_code, _ in languages:
                prune_per_cohort_language(conn, cohort, lang_code, TOP_N_PER_COHORT_LANG)

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
