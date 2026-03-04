"""
CLI entrypoint:
  notify     — send you a weather summary (stdout + optional Discord)
  run        — notify + optionally place bets (dry-run by default)
  fetch      — raw weather data
  signal     — above/below vs a strike
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from . import fetch, signal, notify, bet


def main() -> None:
    ap = argparse.ArgumentParser(prog="weather_edge_bot")
    sub = ap.add_subparsers(dest="cmd", required=True)

    # notify — main use: get weather in your inbox / Discord
    p_notify = sub.add_parser("notify", help="Get a weather summary (prints + optional Discord webhook)")
    p_notify.add_argument("--station", type=str, help="Single station (e.g. KNYC). Default: all from config.")
    p_notify.add_argument("--no-discord", action="store_true", help="Skip Discord even if DISCORD_WEBHOOK_URL is set")

    # run — notify + optional bet placement
    p_run = sub.add_parser("run", help="Notify weather, and optionally place a Kalshi bet (off by default)")
    p_run.add_argument("--station", type=str, help="Station for notification (default: all from config)")
    p_run.add_argument("--no-discord", action="store_true", help="Skip Discord for notification")
    p_run.add_argument("--place-bets", action="store_true", help="Also place a bet from signal (needs Kalshi API keys)")
    p_run.add_argument("--series-ticker", type=str, default="KXHIGHNY", help="Series for bet (default: KXHIGHNY)")
    p_run.add_argument("--strike", type=int, help="Strike temp °F for bet (required if --place-bets)")
    p_run.add_argument("--confirm", action="store_true", help="Actually place the order (default is dry-run)")
    p_run.add_argument("--yes-price", type=int, default=50, help="Limit price in cents (default: 50)")

    # fetch
    p_fetch = sub.add_parser("fetch", help="Fetch early weather data (METAR + NWS)")
    p_fetch.add_argument("--station", type=str, help="Single station ID (e.g. KNYC)")
    p_fetch.add_argument("--json", action="store_true", help="Output JSON")

    # signal
    p_sig = sub.add_parser("signal", help="Compare early data to strike (above/below)")
    p_sig.add_argument("--series-ticker", type=str, required=True, help="e.g. KXHIGHNY")
    p_sig.add_argument("--strike", type=int, required=True, help="Strike temp in °F")
    p_sig.add_argument("--json", action="store_true", help="Output JSON")

    args = ap.parse_args()

    if args.cmd == "notify":
        notify.notify(
            station_id=getattr(args, "station", None),
            discord=not getattr(args, "no_discord", False),
        )
        return

    if args.cmd == "run":
        notify.notify(
            station_id=getattr(args, "station", None),
            discord=not getattr(args, "no_discord", False),
        )
        if getattr(args, "place_bets", False):
            strike = getattr(args, "strike", None)
            if strike is None:
                print("Error: --strike required when using --place-bets")
                sys.exit(1)
            result = bet.place_bet_for_signal(
                getattr(args, "series_ticker", "KXHIGHNY"),
                strike,
                yes_price=getattr(args, "yes_price", 50),
                dry_run=not getattr(args, "confirm", False),
            )
            print(json.dumps(result, indent=2))
            if result.get("error"):
                sys.exit(1)
        return

    if args.cmd == "fetch":
        fetch.main(station=getattr(args, "station", None), json_out=getattr(args, "json", False))
        return

    if args.cmd == "signal":
        result = signal.run_signal(args.series_ticker, args.strike)
        print(json.dumps(result, indent=2))
        if result.get("error"):
            sys.exit(1)
        return

    sys.exit(1)


if __name__ == "__main__":
    main()
