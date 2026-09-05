# TimesFM forecasts — free hosting design

## Why a nightly batch, not a live model server?

Google TimesFM has **no serverless API** (it's not on any Hugging Face
Inference Provider), so it must be self-hosted in Python. The numbers:

| Option | RAM / GPU | Cost | Verdict |
|---|---|---|---|
| Render free (our API host) | 512 MB | $0 | ❌ TimesFM 2.5 needs ~1.5 GB |
| HF ZeroGPU Space | serverless H200 | $0 (5 GPU-min/day, ~3 runs/day on free tier) | ⚠️ workable but tight quotas, cold starts, Gradio-only |
| Hugging Face CPU Space | 2 vCPU / 16 GB | needs PRO ($9/mo) to create | ❌ not free |
| BigQuery ML `AI.FORECAST` | managed | needs GCP billing account | ❌ not free |
| **GitHub Actions CPU runner** | **7 GB RAM** | **$0 (free tier; unlimited on public repos)** | ✅ **chosen** |

TimesFM 2.5 (200M) does ~2–5s per series on CPU → all 50 Nifty stocks in
~3–5 minutes. The workflow (`.github/workflows/timesfm-nightly.yml`) runs
weekdays at 19:00 IST and commits `forecasts.json` + `picks.json`. The Node
server just reads the JSON — zero runtime ML cost, zero new infra.

## Files

- `forecast_nifty.py` — fetches 2y daily closes (yfinance) → TimesFM 2.5,
  20-trading-day horizon, p10/p50/p90 bands → risk-adjusted ranking.
- `requirements.txt` — `timesfm[torch]`, CPU-only torch, yfinance, pandas.
- `forecasts.json` — generated, keyed by bare symbol (`RELIANCE`).
- `picks.json` — generated, top-5 ranked picks with bands.

## API (served by Node, free)

- `GET /api/forecast/:ticker` — p10/p50/p90 arrays + expected return.
- `GET /api/timesfm-picks` — nightly top-5 + generation timestamp.

## Future: on-demand forecasts for any ticker

If nightly Nifty coverage isn't enough, the upgrade path is an HF ZeroGPU
Gradio Space wrapping the same script (free tier: 5 GPU-min/day ≈ one
50-stock batch + a few singles). The Node layer already degrades gracefully
when a forecast is missing, so this can be added without touching the app.
