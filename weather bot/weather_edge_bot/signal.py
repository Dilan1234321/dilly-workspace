"""
Signal layer: compare early weather data to a strike and decide above/below.
Uses METAR maxT24 when available (early 24h high), else current temp as proxy.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .fetchers import fetch_metar, fetch_nws_station_obs


def load_config() -> dict[str, Any]:
    """Load config from config/stations.json or .example."""
    base = Path(__file__).resolve().parent.parent
    for name in ("stations.json", "stations.example.json"):
        p = base / "config" / name
        if p.exists():
            with open(p) as f:
                return json.load(f)
    return {"stations": [], "data_sources": {}}


def get_station_for_series(series_ticker: str) -> dict[str, Any] | None:
    """Return station config for a Kalshi series ticker."""
    config = load_config()
    for s in config.get("stations") or []:
        if (s.get("series_ticker") or "").upper() == series_ticker.upper():
            return s
    return None


def gather_early_data(station_id: str) -> dict[str, Any]:
    """Fetch METAR and NWS obs for a station. Prefer METAR for maxT24 (early 24h high)."""
    out: dict[str, Any] = {"station_id": station_id, "metar": None, "nws": None}
    metar = fetch_metar(station_id)
    if metar and "error" not in metar:
        out["metar"] = metar
    nws = fetch_nws_station_obs(station_id)
    if nws and "error" not in nws:
        out["nws"] = nws
    return out


def best_early_high_f(data: dict[str, Any]) -> float | None:
    """
    Best available early high temp in °F for comparison to strike.
    Prefer METAR max_temp_24h_f (the early 24h high), else METAR current temp, else NWS current.
    """
    metar = data.get("metar") or {}
    nws = data.get("nws") or {}
    if metar.get("max_temp_24h_f") is not None:
        return float(metar["max_temp_24h_f"])
    if metar.get("temp_f") is not None:
        return float(metar["temp_f"])
    if nws.get("temp_f") is not None:
        return float(nws["temp_f"])
    return None


def signal_above_below(early_high_f: float, strike_f: int) -> str:
    """Returns 'above' or 'below' relative to strike. For same-day high, early_high is a proxy."""
    return "above" if early_high_f >= strike_f else "below"


def run_signal(series_ticker: str, strike: int) -> dict[str, Any]:
    """
    Load station for series, fetch early data, compare to strike.
    Returns dict with early_high_f, strike, signal ('above'|'below'), and raw data summary.
    """
    station = get_station_for_series(series_ticker)
    if not station:
        return {
            "error": f"Unknown series_ticker: {series_ticker}. Add to config/stations.json.",
            "series_ticker": series_ticker,
            "strike": strike,
        }
    station_id = station.get("metar_station") or station.get("nws_station")
    if not station_id:
        return {"error": "No metar_station or nws_station in config", "station": station, "strike": strike}

    data = gather_early_data(station_id)
    early_high_f = best_early_high_f(data)
    if early_high_f is None:
        return {
            "error": "No temperature data from METAR or NWS",
            "series_ticker": series_ticker,
            "station_id": station_id,
            "strike": strike,
            "data": data,
        }

    sig = signal_above_below(early_high_f, strike)
    return {
        "series_ticker": series_ticker,
        "station_id": station_id,
        "early_high_f": early_high_f,
        "strike": strike,
        "signal": sig,
        "note": "Early 24h high from METAR when available; otherwise current temp. Compare to official NWS CLI for settlement.",
        "data_summary": {
            "metar_max_24h_f": (data.get("metar") or {}).get("max_temp_24h_f"),
            "metar_temp_f": (data.get("metar") or {}).get("temp_f"),
            "nws_temp_f": (data.get("nws") or {}).get("temp_f"),
        },
    }
