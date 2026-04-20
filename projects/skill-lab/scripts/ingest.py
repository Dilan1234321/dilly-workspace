"""
Nightly YouTube ingest for Skill Lab.

- Reads search queries from skill_lab_cohort_queries.
- Calls YouTube Data API v3 (search.list + videos.list + channels.list).
- Scores each candidate with a weighted algorithmic model (no LLM).
- Upserts the top-N per cohort into skill_lab_videos.

Run:
    YOUTUBE_API_KEY=... DATABASE_URL=... python projects/skill-lab/scripts/ingest.py

Wired into crons.json at repo root. Budget ~2500 units/day (out of 10k free tier)
so it can run daily without hitting the quota.
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
TOP_N_PER_COHORT = 60               # keep the top N ranked videos per cohort
MAX_RESULTS_PER_QUERY = 25          # YouTube caps at 50; 25 keeps quota lower
MIN_DURATION_SEC = 180              # 3 min — filter out shorts and trailers
MAX_DURATION_SEC = 4 * 3600         # 4 hours — filter runaway lectures


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


# ── YouTube API helpers ────────────────────────────────────────────────────────

def yt_get(path: str, params: dict, key: str) -> dict:
    r = requests.get(
        f"{YT_API}/{path}",
        params={**params, "key": key},
        timeout=15,
    )
    if r.status_code != 200:
        raise RuntimeError(f"YouTube {path} {r.status_code}: {r.text[:200]}")
    return r.json()


def search_video_ids(query: str, key: str) -> list[str]:
    data = yt_get(
        "search",
        {
            "part": "id",
            "q": query,
            "type": "video",
            "videoDuration": "medium",  # 4-20 min bucket by YouTube's definition
            "videoEmbeddable": "true",
            "relevanceLanguage": "en",
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
    # Batches of 50
    for i in range(0, len(ids), 50):
        batch = ids[i : i + 50]
        data = yt_get("channels", {"part": "statistics", "id": ",".join(batch)}, key)
        for it in data.get("items", []):
            cid = it["id"]
            subs = int(it.get("statistics", {}).get("subscriberCount", 0) or 0)
            out[cid] = subs
    return out


# ── Parsing + scoring ──────────────────────────────────────────────────────────

def parse_iso8601_duration(s: str) -> int:
    """Parse 'PT1H23M45S' -> seconds. Returns 0 on parse failure."""
    if not s or not s.startswith("PT"):
        return 0
    hours = minutes = seconds = 0
    num = ""
    for ch in s[2:]:
        if ch.isdigit():
            num += ch
        else:
            if ch == "H":
                hours = int(num or 0)
            elif ch == "M":
                minutes = int(num or 0)
            elif ch == "S":
                seconds = int(num or 0)
            num = ""
    return hours * 3600 + minutes * 60 + seconds


def duration_sanity(sec: int) -> float:
    """0–1: peaks for 8–45 min videos (the sweet spot for learning content)."""
    if sec < MIN_DURATION_SEC or sec > MAX_DURATION_SEC:
        return 0.0
    if 480 <= sec <= 2700:
        return 1.0
    if sec < 480:
        return max(0.4, sec / 480.0)
    return max(0.4, 1.0 - (sec - 2700) / (MAX_DURATION_SEC - 2700))


def days_since(published: datetime) -> float:
    return max(1.0, (datetime.now(timezone.utc) - published).total_seconds() / 86400.0)


def score_video(
    view_count: int,
    like_count: int,
    comment_count: int,
    subscriber_count: int,
    duration_sec: int,
    published_at: datetime,
    query_weight: float,
) -> float:
    """0–100. Weighted algorithmic score, no LLM."""
    age_days = days_since(published_at)
    views_per_day = view_count / age_days
    view_velocity = math.log10(views_per_day + 1.0) / 5.0       # ~1.0 at 100k views/day
    engagement = (like_count + comment_count * 2) / max(1, view_count)
    engagement = min(1.0, engagement * 40.0)                    # engagement rates are small; scale up
    channel_authority = math.log10(subscriber_count + 1.0) / 7.0  # ~1.0 at 10M subs
    duration_fit = duration_sanity(duration_sec)
    recency = max(0.25, 1.0 - min(1.0, age_days / (5 * 365)))

    raw = (
        0.30 * view_velocity
        + 0.22 * engagement
        + 0.20 * channel_authority
        + 0.18 * duration_fit
        + 0.10 * recency
    )
    return round(max(0.0, min(1.0, raw)) * query_weight * 100.0, 2)


def to_row(item: dict, cohort: str, subs: int, query_weight: float) -> VideoRow | None:
    vid = item.get("id")
    snippet = item.get("snippet", {})
    content = item.get("contentDetails", {})
    stats = item.get("statistics", {})
    if not vid or not snippet:
        return None

    duration_sec = parse_iso8601_duration(content.get("duration", ""))
    if duration_sec < MIN_DURATION_SEC or duration_sec > MAX_DURATION_SEC:
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

    quality = score_video(
        view_count, like_count, comment_count, subs,
        duration_sec, published_at, query_weight,
    )

    return VideoRow(
        id=vid,
        title=snippet.get("title", "")[:500],
        description=(snippet.get("description") or "")[:2000],
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
                subscriber_count, published_at, thumbnail_url, quality_score, fetched_at
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
                fetched_at = NOW()
            """,
            [
                (
                    r.id, r.title, r.description, r.channel_id, r.channel_title, r.cohort,
                    r.duration_sec, r.view_count, r.like_count, r.comment_count,
                    r.subscriber_count, r.published_at, r.thumbnail_url, r.quality_score,
                    datetime.now(timezone.utc),
                )
                for r in rows
            ],
        )
    conn.commit()


def prune_low_scorers(conn, cohort: str, keep_top: int = TOP_N_PER_COHORT) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM skill_lab_videos
             WHERE cohort = %s
               AND id NOT IN (
                   SELECT id FROM skill_lab_videos
                    WHERE cohort = %s
                    ORDER BY quality_score DESC
                    LIMIT %s
               )
            """,
            (cohort, cohort, keep_top),
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


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    key = os.environ.get("YOUTUBE_API_KEY")
    db_url = os.environ.get("DATABASE_URL")
    if not key:
        print("YOUTUBE_API_KEY not set", file=sys.stderr)
        return 1
    if not db_url:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    conn = psycopg2.connect(db_url)
    try:
        queries_by_cohort = load_queries(conn)
        if not queries_by_cohort:
            print("No cohort queries seeded. Run 002_cohort_queries_seed.sql.", file=sys.stderr)
            return 1

        for cohort, queries in queries_by_cohort.items():
            print(f"[{cohort}] {len(queries)} queries")
            all_items: list[tuple[dict, float]] = []
            for q, weight in queries:
                try:
                    ids = search_video_ids(q, key)
                    for item in fetch_video_details(ids, key):
                        all_items.append((item, weight))
                except Exception as e:
                    print(f"  ! query '{q}' failed: {e}", file=sys.stderr)
                time.sleep(0.25)  # polite pacing

            channel_ids = {i.get("snippet", {}).get("channelId", "") for i, _ in all_items}
            subs_by_channel = fetch_channel_subs(channel_ids, key)

            rows: list[VideoRow] = []
            for item, weight in all_items:
                cid = item.get("snippet", {}).get("channelId", "")
                subs = subs_by_channel.get(cid, 0)
                row = to_row(item, cohort, subs, weight)
                if row:
                    rows.append(row)

            # Dedupe by id, keep the highest score
            best_by_id: dict[str, VideoRow] = {}
            for r in rows:
                cur = best_by_id.get(r.id)
                if not cur or r.quality_score > cur.quality_score:
                    best_by_id[r.id] = r

            rows = sorted(best_by_id.values(), key=lambda r: r.quality_score, reverse=True)[
                :TOP_N_PER_COHORT
            ]
            print(f"  upserting {len(rows)} rows")
            upsert_videos(conn, rows)
            prune_low_scorers(conn, cohort, keep_top=TOP_N_PER_COHORT)

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
