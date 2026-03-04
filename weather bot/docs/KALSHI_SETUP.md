# Kalshi API Setup (Optional Trading)

To **place orders** you need API credentials. Market data (series, markets, orderbook) is public and does not require auth.

## 1. Create API key

1. Log in at [kalshi.com](https://kalshi.com).
2. Go to **Account → API** (or Settings → API Keys).
3. Create a new API key. You get:
   - **Key ID** (e.g. `abc123...`)
   - **Private key** (PEM) — download or copy once; it won’t be shown again.

## 2. Environment variables

Set these in your shell or `.env` (use `python-dotenv` if you load `.env` in code):

```bash
export KALSHI_API_KEY_ID="your_key_id"
export KALSHI_PRIVATE_KEY_PEM="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
```

Or the key may be named `KALSHI_API_PRIVATE_KEY_PEM`; the code checks both.

## 3. Signing (RSA-PSS)

Authenticated requests use **RSA-PSS SHA256**: sign `timestamp + method + path` (no query string) with your private key. The `place_order` helper in `kalshi_client.py` does this and requires:

```bash
pip install cryptography
```

## 4. Rate limits and ToS

- Respect Kalshi’s API rate limits and Terms of Service.
- Automated trading or use of non-public data may be restricted; confirm with Kalshi before relying on this for live trading.

## 5. Read-only usage (no keys)

You can run without any keys:

- `python -m weather_edge_bot fetch` — early METAR/NWS data.
- `python -m weather_edge_bot signal --series-ticker KXHIGHNY --strike 75` — above/below signal from early data.
- Use `kalshi_client.get_series()`, `get_markets()`, `get_orderbook()` for public market data.
