"""
Notify you with a weather summary. Optional: Discord webhook.
Always prints to stdout so you can cron + mail or pipe elsewhere.
"""
from __future__ import annotations

import os
import requests
from typing import Any

from . import signal
from .signal import load_config


def _build_message(station_id: str | None = None) -> str:
    """Fetch data for configured stations (or one station) and build a short message."""
    if station_id:
        stations = [{"metar_station": station_id, "nws_station": station_id, "series_ticker": None, "name": station_id}]
    else:
        config = load_config()
        stations = config.get("stations") or []
        if not stations:
            return "No stations in config. Add config/stations.json or pass --station KNYC."
        stations = [s for s in stations if s.get("metar_station") or s.get("nws_station")]

    lines = ["Weather update (early data from METAR/NWS):"]
    for s in stations:
        sid = s.get("metar_station") or s.get("nws_station")
        name = s.get("name") or s.get("series_ticker") or sid
        data = signal.gather_early_data(sid)
        metar = data.get("metar") or {}
        nws = data.get("nws") or {}
        now_f = metar.get("temp_f") or nws.get("temp_f")
        max24_f = metar.get("max_temp_24h_f")
        parts = [f"• {name}: now {now_f}°F" if now_f is not None else f"• {name}: no current temp"]
        if max24_f is not None:
            parts.append(f", 24h max {max24_f}°F")
        lines.append("".join(parts))
    return "\n".join(lines)


def send_discord(content: str, webhook_url: str | None = None) -> bool:
    """POST content to a Discord webhook. Returns True if sent."""
    url = webhook_url or os.environ.get("DISCORD_WEBHOOK_URL")
    if not url:
        return False
    try:
        r = requests.post(url, json={"content": content[:2000]}, timeout=10)
        r.raise_for_status()
        return True
    except Exception:
        return False


def notify(station_id: str | None = None, discord: bool = True) -> str:
    """
    Build weather message, print it, and optionally send to Discord if DISCORD_WEBHOOK_URL is set.
    Returns the message string.
    """
    msg = _build_message(station_id)
    print(msg)
    if discord and os.environ.get("DISCORD_WEBHOOK_URL"):
        if send_discord(msg):
            print("(Also sent to Discord.)")
        else:
            print("(Discord send failed.)")
    return msg
