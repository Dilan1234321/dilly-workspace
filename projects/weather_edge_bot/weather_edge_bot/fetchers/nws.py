"""
NWS API and time-series data for official station obs.
api.weather.gov — stations, points, observations.
"""
from __future__ import annotations

import requests
from typing import Any

NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "WeatherEdgeBot/1.0 (nws data)"


def fetch_nws_station_obs(
    station_id: str,
    *,
    base: str = NWS_API_BASE,
) -> dict[str, Any] | None:
    """
    Fetch latest observation for an NWS station (e.g. KNYC, KORD).
    Uses NWS API stations endpoint; returns latest obs with temperature.
    """
    # NWS uses 4-letter station IDs in observation URLs
    # https://api.weather.gov/stations/KNYC/observations/latest
    url = f"{base.rstrip('/')}/stations/{station_id}/observations/latest"
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return {"error": str(e), "station_id": station_id, "source": "nws"}

    props = data.get("properties") or {}
    temp_c = props.get("temperature", {}).get("value")
    out: dict[str, Any] = {
        "source": "nws",
        "station_id": station_id,
        "timestamp": props.get("timestamp"),
        "temp_c": temp_c,
        "temp_f": _c2f(temp_c) if temp_c is not None else None,
        "raw": props.get("rawMessage"),
    }
    # NWS latest obs doesn't always include 24h max; that's in CLI/DSM. Still useful for current/running max.
    return out


def _c2f(c: float | None) -> float | None:
    if c is None:
        return None
    return round(c * 9 / 5 + 32, 1)
