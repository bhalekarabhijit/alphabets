# Straddle paper trader (free, automated)

A daily GitHub Actions job (`papertrade.yml`, weekdays 19:30 IST + manual)
paper-trades the screener's long-straddle picks and commits the track record
to `papertrade/paper-trades.json`. The site shows it on the Straddle tab.

## Rules (v1)

- **Enter:** screener verdict EDGE with edge ≥ 1.3, ≥ 5 days to expiry, no
  open position on the same underlying, max 3 new entries/day (top edge first).
- **Exit:** straddle value +50% (take profit) / −50% (stop) / ≤ 3 days to
  expiry (avoid expiry pinning) / past expiry → settle at intrinsic value
  (`|spot − strike|` via Yahoo).
- **Scoring:** per-share % P&L — no lot-size data needed.

## Cost

Public repo → Actions minutes unlimited. Each run ≈ 2–5 min (NSE chains +
Yahoo marks). No real money, no broker needed — marks come from NSE chains.

## Files

- `track.mjs` — the trader. Run from repo root: `node papertrade/track.mjs`
  (needs `server/node_modules` installed). Reuses `server/services/straddle.js`
  so paper results reflect the production screen.
- `paper-trades.json` — generated state: `{ open, closed, stats }`.

## API / UI

- `GET /api/paper-trades` — served via `repoJson` loader (disk + GitHub-raw
  fallback, so new results show without a redeploy).
- Straddle tab → "Paper track record" panel: win rate, avg P&L, open paper
  positions with live %, recently closed with exit reasons.
