"""
METAR from Aviation Weather (aviationweather.gov).
Cache updates every 1 min. Rate limit: stay under 100 req/min; use cache for bulk.
Temp fields: temp (C), maxT24/minT24 (24h max/min C), maxT/minT (6h).
"""
from __future__ import annotations

import requests
from typing import Any

DEFAULT_BASE = "https://aviationweather.gov/api/data"
USER_AGENT = "WeatherEdgeBot/1.0 (aviation weather data)"


def fetch_metar(
    station_id: str,
    *,
    base: str = DEFAULT_BASE,
) -> dict[str, Any] | None:
    """
    Fetch latest METAR for one station. Returns observation with temp (C), maxT24, minT24 when present.
    """
    url = f"{base.rstrip('/')}/metar"
    params = {"ids": station_id, "format": "json"}
    headers = {"User-Agent": USER_AGENT}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return {"error": str(e), "station_id": station_id}

    if not data or not isinstance(data, list):
        return {"error": "empty or invalid response", "station_id": station_id}

    # Prefer mostRecent=1, else latest by obsTime
    recent = [m for m in data if m.get("mostRecent") == 1]
    ob = recent[0] if recent else (data[0] if data else None)
    if not ob:
        return None

    # Normalize to our shape (all temps in C from API)
    out: dict[str, Any] = {
        "source": "aviation_metar",
        "station_id": ob.get("icaoId") or station_id,
        "obs_time": ob.get("obsTime"),
        "report_time": ob.get("reportTime"),
        "temp_c": ob.get("temp"),
        "temp_f": _c2f(ob.get("temp")),
        "dewpoint_c": ob.get("dewp"),
        "raw": ob.get("rawOb"),
    }
    if ob.get("maxT24") is not None:
        out["max_temp_24h_c"] = ob["maxT24"]
        out["max_temp_24h_f"] = _c2f(ob["maxT24"])
    if ob.get("minT24") is not None:
        out["min_temp_24h_c"] = ob["minT24"]
        out["min_temp_24h_f"] = _c2f(ob["minT24"])
    if ob.get("maxT") is not None:
        out["max_temp_6h_c"] = ob["maxT"]
        out["max_temp_6h_f"] = _c2f(ob["maxT"])
    if ob.get("minT") is not None:
        out["min_temp_6h_c"] = ob["minT"]
        out["min_temp_6h_f"] = _c2f(ob["minT"])

    return out


def _c2f(c: float | None) -> float | None:
    if c is None:
        return None
    return round(c * 9 / 5 + 32, 1)
