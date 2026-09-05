"""
Nightly TimesFM batch forecasts (runs on GitHub Actions CPU).

- Universe selectable: nifty50 (default), next50, midcap50, smallcap50.
  Constituents are fetched live from niftyindices.com CSVs.
- Fetches ~2y of daily closes via yfinance (fresh GHA IP, no rate limits).
- Runs Google TimesFM 2.5 (200M, zero-shot, CPU) -> 20-trading-day forecast
  with p10 / p50 / p90 quantile bands.
- Writes forecast/forecasts-<universe>.json + forecast/picks-<universe>.json,
  committed to main. (nifty50 also keeps legacy forecasts.json/picks.json.)
- The Node server serves these with zero runtime ML cost.

~2-5s per ticker on CPU => ~3-5 min per 50-stock universe.
"""

import argparse
import csv
import io
import json
import os
import sys
import traceback
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import yfinance as yf

MODEL_ID = "google/timesfm-2.5-200m-pytorch"
HORIZON = 20          # trading days ahead
MAX_CONTEXT = 512     # trading days of history to feed the model
MIN_HISTORY = 200     # skip tickers with less history than this

UNIVERSES = {
    "nifty50": {
        "label": "Nifty 50",
        "csv": "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
    },
    "next50": {
        "label": "Nifty Next 50",
        "csv": "https://www.niftyindices.com/IndexConstituent/ind_niftynext50list.csv",
    },
    "midcap50": {
        "label": "Nifty Midcap 50",
        "csv": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap50list.csv",
    },
    "smallcap50": {
        "label": "Nifty Smallcap 50",
        "csv": "https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap50list.csv",
    },
}

# Fallback if niftyindices.com is unreachable (kept in sync semi-regularly).
FALLBACK_NIFTY50 = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS", "SUNPHARMA.NS",
    "TITAN.NS", "BAJFINANCE.NS", "HCLTECH.NS", "WIPRO.NS", "ULTRACEMCO.NS",
    "TATASTEEL.NS", "JSWSTEEL.NS", "NTPC.NS", "POWERGRID.NS", "ONGC.NS",
    "M&M.NS", "TATAMOTORS.NS", "ADANIPORTS.NS", "TECHM.NS", "COALINDIA.NS",
    "ADANIENT.NS", "BPCL.NS", "DIVISLAB.NS", "DRREDDY.NS", "CIPLA.NS",
    "GRASIM.NS", "HEROMOTOCO.NS", "EICHERMOT.NS", "BRITANNIA.NS", "NESTLEIND.NS",
    "APOLLOHOSP.NS", "SBILIFE.NS", "BAJAJFINSV.NS", "INDUSINDBK.NS", "HDFCLIFE.NS",
    "TATACONSUM.NS", "PIDILITIND.NS", "DABUR.NS", "SHREECEM.NS", "UPL.NS",
]

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def fetch_universe(universe_id: str) -> list[tuple[str, str]]:
    """Returns [(ticker_ns, company_name)] from the live Nifty CSV."""
    url = UNIVERSES[universe_id]["csv"]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for r in rows:
        sym = (r.get("Symbol") or "").strip()
        series = (r.get("Series") or "").strip().upper()
        if not sym or series not in ("EQ", ""):
            continue
        out.append((f"{sym}.NS", (r.get("Company Name") or sym).strip()))
    # de-dup, preserve order
    seen, uniq = set(), []
    for t in out:
        if t[0] not in seen:
            seen.add(t[0])
            uniq.append(t)
    if len(uniq) < 10:
        raise RuntimeError(f"Universe CSV yielded only {len(uniq)} symbols")
    return uniq


def fetch_closes(ticker: str) -> pd.Series | None:
    try:
        df = yf.download(ticker, period="2y", interval="1d",
                         progress=False, auto_adjust=True)
        if df is None or df.empty:
            return None
        closes = df["Close"]
        if isinstance(closes, pd.DataFrame):  # multi-ticker frame guard
            closes = closes.iloc[:, 0]
        closes = closes.dropna()
        if len(closes) < MIN_HISTORY:
            return None
        return closes
    except Exception as e:
        print(f"  ⚠️ {ticker}: history fetch failed: {e}")
        return None


def main() -> int:
    from timesfm import TimesFM_2p5_200M_torch, ForecastConfig

    ap = argparse.ArgumentParser()
    ap.add_argument("--universe", default="nifty50", choices=list(UNIVERSES))
    args = ap.parse_args()
    universe_id = args.universe
    label = UNIVERSES[universe_id]["label"]

    try:
        members = fetch_universe(universe_id)
        print(f"Universe {label}: {len(members)} constituents (live CSV).")
    except Exception as e:
        print(f"  ⚠️ Constituent CSV failed ({e}). ", end="")
        if universe_id != "nifty50":
            print("Aborting (no fallback for this universe).")
            return 1
        members = [(t, t.replace(".NS", "")) for t in FALLBACK_NIFTY50]
        print(f"Using fallback list ({len(members)}).")

    print(f"Loading {MODEL_ID} (CPU, ~800MB download once)...")
    # torch_compile=False: skips the slow inductor compile; plain eager is
    # faster overall for a 50-series batch on CPU.
    model = TimesFM_2p5_200M_torch.from_pretrained(
        MODEL_ID, torch_compile=False)
    model.compile(ForecastConfig(
        max_context=MAX_CONTEXT,
        max_horizon=HORIZON,
        per_core_batch_size=8,
    ))
    print("Model ready.\n")

    forecasts: dict = {}
    ok, skipped = 0, 0

    for i, (ticker, name) in enumerate(members, 1):
        symbol = ticker.replace(".NS", "")
        try:
            closes = fetch_closes(ticker)
            if closes is None:
                skipped += 1
                continue
            context = closes.values.astype(np.float32)[-MAX_CONTEXT:]
            last_close = float(context[-1])
            last_date = closes.index[-1].date().isoformat()

            point, quantile = model.forecast(HORIZON, [context])
            # quantile cols = [median, q10..q90]: col 0 is NOT p10.
            p10 = np.asarray(quantile[0][:, 1], dtype=float)   # 10th pct
            p50 = np.asarray(point[0], dtype=float)            # mean
            p90 = np.asarray(quantile[0][:, -1], dtype=float)  # 90th pct

            future_dates = pd.bdate_range(
                start=closes.index[-1], periods=HORIZON + 1)[1:]
            dates = [d.date().isoformat() for d in future_dates]

            target = float(p50[-1])
            exp_ret = (target / last_close - 1) * 100
            upside = (float(p90[-1]) / last_close - 1) * 100
            downside = (float(p10[-1]) / last_close - 1) * 100
            band_width = upside - downside
            score = exp_ret / (1 + max(band_width, 0))  # risk-adjusted

            forecasts[symbol] = {
                "ticker": ticker,
                "name": name,
                "last_close": round(last_close, 2),
                "last_date": last_date,
                "dates": dates,
                "p10": [round(float(v), 2) for v in p10],
                "p50": [round(float(v), 2) for v in p50],
                "p90": [round(float(v), 2) for v in p90],
                "target_20d": round(target, 2),
                "expected_return_pct": round(exp_ret, 2),
                "upside_pct": round(upside, 2),
                "downside_pct": round(downside, 2),
                "score": round(float(score), 4),
            }
            ok += 1
            print(f"  [{i}/{len(members)}] {symbol}: "
                  f"₹{last_close:.0f} -> ₹{target:.0f} "
                  f"({exp_ret:+.1f}%, band {downside:+.1f}/{upside:+.1f})")
        except Exception:
            skipped += 1
            print(f"  ⚠️ {ticker}: forecast failed")
            traceback.print_exc(limit=3)

    generated_at = datetime.now(timezone.utc).isoformat()
    payload = {"generated_at": generated_at, "model": "timesfm-2.5-200m",
               "universe": universe_id, "universe_label": label,
               "horizon_days": HORIZON, "forecasts": forecasts}
    with open(os.path.join(OUT_DIR, f"forecasts-{universe_id}.json"), "w") as f:
        json.dump(payload, f)

    ranked = sorted(forecasts.items(), key=lambda kv: kv[1]["score"],
                    reverse=True)[:5]
    picks = [{"rank": r + 1, "symbol": sym, **fc}
             for r, (sym, fc) in enumerate(ranked)]
    picks_payload = {"generated_at": generated_at, "model": "timesfm-2.5-200m",
                     "universe": universe_id, "universe_label": label,
                     "universe_size": len(forecasts), "picks": picks}
    with open(os.path.join(OUT_DIR, f"picks-{universe_id}.json"), "w") as f:
        json.dump(picks_payload, f, indent=2)

    # Back-compat: nifty50 keeps the legacy filenames the API/UI already read.
    if universe_id == "nifty50":
        with open(os.path.join(OUT_DIR, "forecasts.json"), "w") as f:
            json.dump(payload, f)
        with open(os.path.join(OUT_DIR, "picks.json"), "w") as f:
            json.dump(picks_payload, f, indent=2)

    print(f"\n✅ {ok} forecasts, {skipped} skipped. "
          f"Top pick: {picks[0]['symbol'] if picks else 'none'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
