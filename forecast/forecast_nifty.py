"""
Nightly TimesFM batch forecasts for Nifty 50 (runs on GitHub Actions CPU).

- Fetches ~2y of daily closes via yfinance (fresh GHA IP, no rate limits).
- Runs Google TimesFM 2.5 (200M, zero-shot, CPU) -> 20-trading-day forecast
  with p10 / p50 / p90 quantile bands.
- Writes forecast/forecasts.json + forecast/picks.json, committed to main.
- The Node server serves these with zero runtime ML cost.

~2-5s per ticker on CPU => ~3-5 min for 50 tickers. Well within GHA free tier.
"""

import json
import os
import sys
import traceback
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import yfinance as yf

MODEL_ID = "google/timesfm-2.5-200m-pytorch"
HORIZON = 20          # trading days ahead
MAX_CONTEXT = 512     # trading days of history to feed the model
MIN_HISTORY = 200     # skip tickers with less history than this

NIFTY_50 = [
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
    import timesfm

    print(f"Loading {MODEL_ID} (CPU, this downloads ~800MB once)...")
    tfm = timesfm.TimesFm(
        hparams=timesfm.TimesFmHparams(
            backend="cpu",
            per_core_batch_size=8,
            horizon_len=HORIZON,
        ),
        checkpoint=timesfm.TimesFmCheckpoint(
            huggingface_repo_id=MODEL_ID),
    )
    print("Model ready.\n")

    forecasts: dict = {}
    ok, skipped = 0, 0

    for i, ticker in enumerate(NIFTY_50, 1):
        symbol = ticker.replace(".NS", "")
        try:
            closes = fetch_closes(ticker)
            if closes is None:
                skipped += 1
                continue
            context = closes.values.astype(np.float32)[-MAX_CONTEXT:]
            last_close = float(context[-1])
            last_date = closes.index[-1].date().isoformat()

            point, quantile = tfm.forecast(horizon=HORIZON, inputs=[context])
            p10 = np.asarray(quantile[0][:, 0], dtype=float)  # 10th pct
            p50 = np.asarray(point[0], dtype=float)           # mean
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
            print(f"  [{i}/{len(NIFTY_50)}] {symbol}: "
                  f"₹{last_close:.0f} -> ₹{target:.0f} "
                  f"({exp_ret:+.1f}%, band {downside:+.1f}/{upside:+.1f})")
        except Exception:
            skipped += 1
            print(f"  ⚠️ {ticker}: forecast failed")
            traceback.print_exc(limit=3)

    generated_at = datetime.now(timezone.utc).isoformat()
    with open(os.path.join(OUT_DIR, "forecasts.json"), "w") as f:
        json.dump({"generated_at": generated_at, "model": "timesfm-2.5-200m",
                   "horizon_days": HORIZON, "forecasts": forecasts}, f)

    ranked = sorted(forecasts.items(), key=lambda kv: kv[1]["score"],
                    reverse=True)[:5]
    picks = [{"rank": r + 1, "symbol": sym, **fc}
             for r, (sym, fc) in enumerate(ranked)]
    with open(os.path.join(OUT_DIR, "picks.json"), "w") as f:
        json.dump({"generated_at": generated_at, "model": "timesfm-2.5-200m",
                   "universe": "NIFTY_50", "universe_size": len(forecasts),
                   "picks": picks}, f, indent=2)

    print(f"\n✅ {ok} forecasts, {skipped} skipped. "
          f"Top pick: {picks[0]['symbol'] if picks else 'none'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
