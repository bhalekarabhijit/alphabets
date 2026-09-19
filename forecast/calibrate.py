"""
TimesFM calibration: did old forecasts come true?

Reads forecast/archive/YYYY-MM-DD-<universe>.json snapshots, and for each
snapshot old enough that its 20-trading-day horizon has fully elapsed,
compares against actual closes (yfinance) and scores:
  - coverage: % of tickers whose realized 20d close landed inside [p10, p90]
  - sign_accuracy: % where sign(p50 - last) matched sign(actual - last)
  - mae_pct: mean |p50 - actual| / actual
Writes forecast/calibration.json (committed). Needs only yfinance/pandas/
numpy — no torch, runs in ~1 minute.

Run weekly (calibrate.yml) or locally: python forecast/calibrate.py
"""

import glob
import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.join(OUT_DIR, "archive")
HORIZON = 20


def main() -> int:
    files = sorted(glob.glob(os.path.join(ARCHIVE, "*.json")))
    if not files:
        write_out({}, 0, 0)
        print("No archived forecasts yet — nothing to evaluate.")
        return 0

    today = pd.Timestamp.now(tz="UTC")
    results: dict = {}
    evaluated = pending = 0

    for path in files:
        m = re.match(r"(\d{4}-\d{2}-\d{2})-(.+)\.json", os.path.basename(path))
        if not m:
            continue
        date_s, universe = m.groups()
        try:
            snap = json.load(open(path))
        except Exception:
            continue
        forecasts = snap.get("forecasts", {})
        if not forecasts:
            continue

        # Horizon elapsed? Last forecast date + 20 trading days <= today.
        try:
            last_fc_date = pd.Timestamp(max(f["dates"][-1] for f in forecasts.values()
                                            if f.get("dates")))
        except Exception:
            continue
        if last_fc_date.tzinfo is None:
            last_fc_date = last_fc_date.tz_localize("UTC")
        # 28 calendar days safely covers 20 trading days.
        if (today - last_fc_date).days < 28:
            pending += 1
            continue

        # Evaluate this snapshot.
        tickers = [f["ticker"] for f in forecasts.values() if f.get("ticker")]
        try:
            df = yf.download(" ".join(tickers[:50]), period="3mo", interval="1d",
                             progress=False, auto_adjust=True, group_by="ticker")
        except Exception as e:
            print(f"  ⚠️ download failed for {date_s}-{universe}: {e}")
            pending += 1
            continue

        n = in_band = sign_ok = 0
        mae_sum = 0.0
        for sym, f in forecasts.items():
            try:
                closes = df[f["ticker"]]["Close"] if len(tickers) > 1 else df["Close"]
                if isinstance(closes, pd.DataFrame):
                    closes = closes.iloc[:, 0]
                closes = closes.dropna()
                try:
                    closes.index = closes.index.tz_localize(None)
                except (TypeError, AttributeError):
                    pass
                target_day = f["dates"][-1]
                actual = closes.asof(pd.Timestamp(target_day))
                if actual is None or pd.isna(actual):
                    continue
                actual = float(actual)
                lo = float(f["p10"][-1])
                hi = float(f["p90"][-1])
                pred = float(f["p50"][-1])
                last = float(f["last_close"])
                n += 1
                if lo <= actual <= hi:
                    in_band += 1
                if (pred - last) * (actual - last) > 0:
                    sign_ok += 1
                mae_sum += abs(pred - actual) / actual * 100
            except Exception:
                continue

        if n == 0:
            pending += 1
            continue
        evaluated += 1
        key = f"{date_s}-{universe}"
        results[key] = {
            "universe": universe,
            "snapshot_date": date_s,
            "evaluated_at": today.isoformat(),
            "n": n,
            "coverage_pct": round(in_band / n * 100, 1),
            "sign_accuracy_pct": round(sign_ok / n * 100, 1),
            "mae_pct": round(mae_sum / n, 2),
        }
        print(f"  {key}: n={n} coverage={results[key]['coverage_pct']}% "
              f"sign={results[key]['sign_accuracy_pct']}% mae={results[key]['mae_pct']}%")

    write_out(results, evaluated, pending)
    print(f"✅ {evaluated} snapshots evaluated, {pending} pending (horizon not elapsed).")
    return 0


def write_out(results, evaluated, pending):
    with open(os.path.join(OUT_DIR, "calibration.json"), "w") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(),
                   "horizon_days": HORIZON,
                   "snapshots_evaluated": evaluated,
                   "snapshots_pending": pending,
                   "results": results}, f, indent=2)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
