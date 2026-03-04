# Weather Edge Bot (Kalshi)

Bot that uses **early weather data** (airports/METAR, NWS obs, Mesonet) to inform weather bets on Kalshi before the crowd has official numbers.

## The Edge

- **Kalshi** settles weather markets on **official NOAA/NWS station data** (e.g. Central Park KNYC for NYC). Settlement usually happens the morning after the observation day.
- **Official source**: NWS **CLI report** (Climatological Report) — typically published **~06:19 UTC** (≈1:19 AM ET).
- **Earlier data**:
  - **24hr high in METAR/ASOS**: Often available **~04:51 UTC** (≈11:51 PM ET) — up to **~1.5 hours before** the CLI.
  - **Aviation Weather** METAR cache: updated **every minute**; you can poll for the station’s latest obs.
  - **NWS Time Series**: `api.weather.gov` and `weather.gov/wrh/timeseries?site=KNYC` for near–real-time obs.
- If you ingest the **early** 24h high (or running max from hourly obs) and compare to the **strike** for the market, you can decide to trade in the window **after** early data and **before** most participants see the CLI.

## Data Sources

| Source | What | Update | Use |
|--------|------|--------|-----|
| [Aviation Weather API](https://aviationweather.gov/data/api) | METAR (temp, 24h max where available) | 1 min cache | Early obs for airport stations; some city stations (e.g. KNYC) have METAR-style reports |
| [NWS API](https://www.weather.gov/documentation/services-web-api) | Stations, obs, forecasts | Real-time | Official stations; point obs |
| [NWS Time Series](https://www.weather.gov/wrh/timeseries?site=KNYC) | Hourly obs for a site | Hourly | Running max during the day |
| [Iowa Mesonet](https://mesonet.agron.iastate.edu/) | ASOS history, DSM text | Near real-time | Backup / 24h high in DSM |
| Kalshi API | Markets, orderbook, orders | Real-time | Find strikes and place orders (auth required for orders) |

## Station Mapping

Not every Kalshi city uses an airport. Example:

- **NYC**: Central Park (**KNYC**) — not an airport; NWS CLI + NWS time series + METAR-style obs (e.g. 24h high ~04:51 UTC).
- **Chicago**: Often **KORD** (O’Hare) — airport METAR is the same location as the official station.
- **Miami, Phoenix, etc.**: Often airport stations; METAR = direct early read.

`config/stations.json` maps Kalshi series tickers to the NWS/METAR station(s) and resolution source.

## Setup

```bash
cd projects/weather_edge_bot
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

- **Discord**: set `DISCORD_WEBHOOK_URL` in the env and `notify` (or `run`) will POST the weather summary there.
- **Kalshi bet placement**: set `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY_PEM`; use `run --place-bets --strike N --confirm` to place. See `docs/KALSHI_SETUP.md`.
- Optional: copy `config/stations.example.json` → `config/stations.json` to add more cities.

## Usage

**Primary: get notified about the weather**

```bash
# Print weather summary (all stations in config, or use --station KNYC)
PYTHONPATH=. python -m weather_edge_bot notify

# Same, but also send to Discord if you set DISCORD_WEBHOOK_URL in the env
PYTHONPATH=. python -m weather_edge_bot notify
```

**Optional: notify + place a bet** (only when you turn it on)

```bash
# Notify + show what bet *would* be placed (dry-run; no real order)
PYTHONPATH=. python -m weather_edge_bot run --place-bets --series-ticker KXHIGHNY --strike 75

# Actually place the order (needs Kalshi API keys; use with care)
PYTHONPATH=. python -m weather_edge_bot run --place-bets --series-ticker KXHIGHNY --strike 75 --confirm
```

**Other commands**

- `fetch` — raw METAR/NWS data
- `signal --series-ticker KXHIGHNY --strike 75` — above/below vs strike

## Legal / ToS

- **Kalshi**: Check their Terms of Service and API use policy. Automated or data-advantage trading may be restricted; you are responsible for compliance.
- **Data**: Aviation Weather and NWS data are public; respect rate limits (e.g. Aviation Weather: stay under 100 req/min, prefer cache files for bulk).
- **Not financial advice**: This is a technical scaffold. Use at your own risk.

## Project Layout

```
weather_edge_bot/
├── README.md
├── config/
│   ├── stations.json       # series → station mapping (git-ignored if contains secrets)
│   └── stations.example.json
├── weather_edge_bot/
│   ├── __init__.py
│   ├── fetchers/           # METAR + NWS
│   ├── notify.py           # build message + Discord (optional)
│   ├── bet.py              # optional: place order from signal
│   ├── kalshi_client.py    # Kalshi API (markets + orders)
│   ├── signal.py           # above/below vs strike
│   └── fetch.py            # CLI: raw data
├── requirements.txt
└── docs/
    └── KALSHI_SETUP.md
```
