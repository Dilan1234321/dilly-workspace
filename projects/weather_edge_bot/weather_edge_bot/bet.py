"""
Optional bet placement: use signal to place a Kalshi order when you enable it.
Uses --dry-run by default so nothing is sent until you add --confirm.
"""
from __future__ import annotations

from typing import Any

from . import kalshi_client, signal


def find_market_for_strike(series_ticker: str, strike: int) -> dict[str, Any] | None:
    """Get open markets for series and return one whose title mentions this strike (e.g. '75')."""
    out = kalshi_client.get_markets(series_ticker, status="open")
    if not out or out.get("error"):
        return None
    markets = out.get("markets") or []
    strike_str = str(strike)
    for m in markets:
        title = (m.get("title") or "").lower()
        if strike_str in title and ("above" in title or "below" in title or "°" in title or "temp" in title):
            return m
    # Fallback: any market with strike in title
    for m in markets:
        if strike_str in (m.get("title") or ""):
            return m
    return markets[0] if markets else None


def place_bet_for_signal(
    series_ticker: str,
    strike: int,
    yes_price: int = 50,
    count: int = 1,
    *,
    dry_run: bool = True,
) -> dict[str, Any]:
    """
    Run signal for series+strike, find the matching market, place YES (if above) or NO (if below).
    If dry_run=True, only return what would be done; no order placed.
    """
    sig_result = signal.run_signal(series_ticker, strike)
    if sig_result.get("error"):
        return {"error": sig_result.get("error"), "dry_run": dry_run}

    market = find_market_for_strike(series_ticker, strike)
    if not market:
        return {
            "error": f"No open market found for {series_ticker} strike {strike}",
            "dry_run": dry_run,
        }

    ticker = market.get("ticker")
    side = "yes" if sig_result.get("signal") == "above" else "no"
    plan = {
        "market_ticker": ticker,
        "market_title": market.get("title"),
        "side": side,
        "yes_price": yes_price,
        "count": count,
        "reason": f"Early signal: {sig_result.get('early_high_f')}°F is {sig_result.get('signal')} {strike}°F",
    }

    if dry_run:
        return {"dry_run": True, "would_place": plan, "signal": sig_result}

    result = kalshi_client.place_order(ticker, side=side, yes_price=yes_price, count=count)
    if result and result.get("error"):
        return {"error": result["error"], "plan": plan}
    return {"placed": result, "plan": plan, "signal": sig_result}
