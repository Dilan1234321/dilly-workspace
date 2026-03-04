"""
CLI: fetch early weather data for configured stations (or a single station).
Usage:
  python -m weather_edge_bot.fetch
  python -m weather_edge_bot.fetch --station KNYC
"""
from __future__ import annotations

import argparse
import json
from .fetchers import fetch_metar, fetch_nws_station_obs
from .signal import load_config


def main(station: str | None = None, json_out: bool = False) -> None:
    if station is None and json_out is False:
        ap = argparse.ArgumentParser(description="Fetch early weather data (METAR + NWS)")
        ap.add_argument("--station", type=str, help="Single station ID (e.g. KNYC). If omitted, use all from config.")
        ap.add_argument("--json", action="store_true", help="Output JSON only")
        args = ap.parse_args()
        station = getattr(args, "station", None)
        json_out = getattr(args, "json", False)

    if station:
        stations = [{"metar_station": station, "nws_station": station}]
    else:
        config = load_config()
        stations = config.get("stations") or []
        if not stations:
            out = {"error": "No stations in config. Copy config/stations.example.json to config/stations.json or pass --station KNYC"}
            print(json.dumps(out, indent=2))
            return
        stations = [s for s in stations if s.get("metar_station") or s.get("nws_station")]

    results = []
    for s in stations:
        sid = s.get("metar_station") or s.get("nws_station")
        metar = fetch_metar(sid)
        nws = fetch_nws_station_obs(sid)
        results.append({
            "station_id": sid,
            "series_ticker": s.get("series_ticker"),
            "metar": metar,
            "nws": nws,
        })

    if json_out:
        print(json.dumps(results, indent=2))
        return
    for r in results:
        print(f"\n--- {r['station_id']} ({r.get('series_ticker') or 'N/A'}) ---")
        if r.get("metar") and "error" not in r["metar"]:
            m = r["metar"]
            print(f"  METAR temp: {m.get('temp_f')}°F  (24h max: {m.get('max_temp_24h_f')}°F)")
        else:
            print("  METAR:", r.get("metar") or "no data")
        if r.get("nws") and "error" not in r["nws"]:
            print(f"  NWS temp:   {r['nws'].get('temp_f')}°F")
        else:
            print("  NWS:", r.get("nws") or "no data")


if __name__ == "__main__":
    main()
