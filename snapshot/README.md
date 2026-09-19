# Market snapshots (free, automated)

The API serves precomputed data first and goes live only on miss/staleness.
Two jobs, both cheap enough for the free tier:

| Job | Cadence | Cost | Output |
|---|---|---|---|
| `quotes` | every 30 min, market hours (cron `0,30 4-9 * * 1-5` UTC) | **1 batched Yahoo call** for 51 symbols | `snapshot/quotes.json` |
| `technicals` | daily after close (`45 10 * * 1-5` UTC) | 50 daily-history calls, batched ×5 | `snapshot/technicals.json` |

## Consumption (serve-first)

- `marketData.getSnapshotQuotes()` — fresh < 45 min, else null → live batch.
- `marketData.getSnapshotTechnicals()` — fresh < 26 h, else null → live compute.
- Daily-pick screening runs **zero live calls** when snapshots are fresh
  (was ~200 before batching, ~11 after — now often 0 + 10 cached).
- `GET /api/snapshot` — bulk read for debugging/future UI.

Fundamentals are NOT snapshotted (change quarterly; 6 h TTL cache is enough).
Charts for display stay live (per-ticker, cached 15 min).

## Files

- `snapshot.mjs` — run from repo root: `node snapshot/snapshot.mjs --job=quotes|technicals`
  (needs `server/node_modules`). Reuses production services, same shapes.
- `quotes.json`, `technicals.json` — generated, committed. Technicals store
  full `current`+`signals` so they're interchangeable with live results.
