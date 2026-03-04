"""
Kalshi API client: public market data (no auth) and optional authenticated trading.
Base URL: https://api.elections.kalshi.com/trade-api/v2
"""
from __future__ import annotations

import os
import requests
import time
from typing import Any

KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"


def get_series(series_ticker: str, *, base: str = KALSHI_BASE) -> dict[str, Any] | None:
    """Public: get series info (e.g. KXHIGHNY)."""
    try:
        r = requests.get(f"{base.rstrip('/')}/series/{series_ticker}", timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e), "series_ticker": series_ticker}


def get_markets(
    series_ticker: str,
    *,
    status: str = "open",
    base: str = KALSHI_BASE,
) -> dict[str, Any] | None:
    """Public: get markets for a series (e.g. open temperature strike markets)."""
    try:
        r = requests.get(
            f"{base.rstrip('/')}/markets",
            params={"series_ticker": series_ticker, "status": status},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e), "series_ticker": series_ticker}


def get_orderbook(market_ticker: str, *, base: str = KALSHI_BASE) -> dict[str, Any] | None:
    """Public: get orderbook for a market."""
    try:
        r = requests.get(
            f"{base.rstrip('/')}/markets/{market_ticker}/orderbook",
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e), "market_ticker": market_ticker}


def _sign_request(timestamp_ms: str, method: str, path: str, private_key_pem: str) -> str:
    """RSA-PSS SHA256 signature of timestamp + method + path. Requires cryptography."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        import base64
    except ImportError:
        raise ImportError("pip install cryptography for Kalshi authenticated requests")
    message = f"{timestamp_ms}{method}{path}"
    key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    sig = key.sign(
        message.encode(),
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32),
        hashes.SHA256(),
    )
    return base64.b64encode(sig).decode()


def place_order(
    market_ticker: str,
    side: str,
    yes_price: int,
    count: int = 1,
    *,
    order_type: str = "limit",
    client_order_id: str | None = None,
    base: str = KALSHI_BASE,
) -> dict[str, Any] | None:
    """
    Place a limit order (requires KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PEM in env).
    side: 'yes' or 'no'. yes_price: 1-99 (cents).
    """
    key_id = os.environ.get("KALSHI_API_KEY_ID")
    key_pem = os.environ.get("KALSHI_PRIVATE_KEY_PEM") or os.environ.get("KALSHI_API_PRIVATE_KEY_PEM")
    if not key_id or not key_pem:
        return {"error": "KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PEM required for trading"}
    if client_order_id is None:
        import uuid
        client_order_id = str(uuid.uuid4())
    path = "/trade-api/v2/portfolio/orders"
    method = "POST"
    timestamp_ms = str(int(time.time() * 1000))
    sig = _sign_request(timestamp_ms, method, path, key_pem)
    headers = {
        "KALSHI-ACCESS-KEY": key_id,
        "KALSHI-ACCESS-TIMESTAMP": timestamp_ms,
        "KALSHI-ACCESS-SIGNATURE": sig,
        "Content-Type": "application/json",
    }
    body = {
        "ticker": market_ticker,
        "action": "buy",
        "side": side,
        "count": count,
        "type": order_type,
        "yes_price": yes_price,
        "client_order_id": client_order_id,
    }
    url = f"{base.rstrip('/')}/portfolio/orders"
    try:
        r = requests.post(url, json=body, headers=headers, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e), "market_ticker": market_ticker}
