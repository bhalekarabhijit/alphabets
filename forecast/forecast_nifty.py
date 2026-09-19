"""
Nightly TimesFM batch forecasts (runs on GitHub Actions CPU).

- Universe selectable: nifty50 (default), next50, midcap50, smallcap50.
  Constituents are fetched live from niftyindices.com CSVs.
- Fetches ~2y of daily closes + volumes via yfinance.
- Runs Google TimesFM 3.0 (330M, zero-shot, CPU) -> 20-trading-day forecast
  with p10 / p50 / p90 quantile bands, conditioned on past-only covariates
  (normalized volume + 20d rolling volatility of log returns).
- Writes forecast/forecasts-<universe>.json + forecast/picks-<universe>.json,
  committed to main. (nifty50 also keeps legacy forecasts.json/picks.json.)
- The Node server serves these with zero runtime ML cost.

CPU single-forward-pass inference: seconds per ticker.
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

MODEL_ID = "google/timesfm-3.0-pytorch"
MODEL_LABEL = "timesfm-3.0"
HORIZON = 20          # trading days ahead
MAX_CONTEXT = 512     # trading days of history to feed the model
MIN_HISTORY = 200     # skip tickers with less history than this
RV_WINDOW = 20        # rolling window for the volatility covariate

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


def fetch_ohlcv(ticker: str) -> pd.DataFrame | None:
    """2y daily closes + volumes. None when unusable."""
    try:
        df = yf.download(ticker, period="2y", interval="1d",
                         progress=False, auto_adjust=True)
        if df is None or df.empty:
            return None
        closes = df["Close"]
        vols = df["Volume"]
        if isinstance(closes, pd.DataFrame):  # multi-ticker frame guard
            closes = closes.iloc[:, 0]
        if isinstance(vols, pd.DataFrame):
            vols = vols.iloc[:, 0]
        out = pd.DataFrame({"close": closes, "volume": vols}).dropna()
        if len(out) < MIN_HISTORY:
            return None
        return out
    except Exception as e:
        print(f"  ⚠️ {ticker}: history fetch failed: {e}")
        return None


def build_covariates(df: pd.DataFrame) -> np.ndarray:
    """Past-only covariates, shape (2, T): normalized volume + rolling vol."""
    closes = df["close"].values.astype(np.float64)
    vols = df["volume"].values.astype(np.float64)
    vol_n = vols / max(vols.mean(), 1e-9)
    logp = np.log(np.maximum(closes, 1e-9))
    rets = np.diff(logp, prepend=logp[0])
    rv = np.array([rets[max(0, i - RV_WINDOW):i + 1].std()
                   for i in range(len(rets))])
    return np.stack([vol_n, rv], axis=0).astype(np.float32)


def main() -> int:
    from timesfm3 import TimesFM3Forecaster

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

    print(f"Loading {MODEL_ID} (CPU, ~1.3GB download once)...")
    forecaster = TimesFM3Forecaster.from_pretrained(MODEL_ID, device="cpu")
    print("Model ready.\n")

    forecasts: dict = {}
    ok, skipped = 0, 0

    for i, (ticker, name) in enumerate(members, 1):
        symbol = ticker.replace(".NS", "")
        try:
            df = fetch_ohlcv(ticker)
            if df is None:
                skipped += 1
                continue
            context = df["close"].values.astype(np.float32)[-MAX_CONTEXT:]
            cov = build_covariates(df)[..., -len(context):]
            last_close = float(context[-1])
            last_date = df.index[-1].date().isoformat()

            out = forecaster.predict(
                context=context, horizon=HORIZON,
                past_only_covariates=cov, return_quantiles=True)
            # quantiles cols are [q10..q90]; forecast is the median (p50).
            q = np.asarray(out.quantiles, dtype=float)
            p10 = q[:, 0]
            p50 = np.asarray(out.forecast, dtype=float)
            p90 = q[:, -1]

            future_dates = pd.bdate_range(
                start=df.index[-1], periods=HORIZON + 1)[1:]
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
    payload = {"generated_at": generated_at, "model": MODEL_LABEL,
               "universe": universe_id, "universe_label": label,
               "horizon_days": HORIZON, "forecasts": forecasts}
    with open(os.path.join(OUT_DIR, f"forecasts-{universe_id}.json"), "w") as f:
        json.dump(payload, f)

    ranked = sorted(forecasts.items(), key=lambda kv: kv[1]["score"],
                    reverse=True)[:5]
    picks = [{"rank": r + 1, "symbol": sym, **fc}
             for r, (sym, fc) in enumerate(ranked)]
    picks_payload = {"generated_at": generated_at, "model": MODEL_LABEL,
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
