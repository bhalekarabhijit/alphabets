import { useState, useEffect, useCallback } from 'react';

// Long-straddle screener: compares what options charge for movement
// (ATM straddle breakeven) against two independent movement estimates —
// TimesFM's forecast band and 20-day realized volatility.
export default function Straddle({ apiBase, className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/straddle`);
      const j = await res.json();
      if (j.success) setData(j.data);
    } catch { /* keep old data */ }
  }, [apiBase]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 5 * 60 * 1000); // chains cached 10 min server-side
    return () => clearInterval(t);
  }, [load]);

  const rows = data?.rows || [];
  const genLabel = data?.generated_at
    ? new Date(data.generated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className={`card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">Straddle Screener</div>
        <span className="card-meta">{genLabel ? `Live · ${genLabel}` : 'ATM · nearest expiry'}</span>
      </div>

      <div className="straddle-explainer">
        A long straddle (ATM call + put) profits only if the move beats the premium paid.
        <strong> Edge = model movement ÷ market-priced movement.</strong> Above 1.15 the
        market may be underpricing movement; below 0.85 it's overpricing it. Base rate:
        long straddles win roughly 1 in 3 — this screen finds mispricings, not guarantees.
      </div>

      {loading ? (
        <div className="loading-container" style={{ padding: '40px 20px' }}>
          <div className="loading-spinner"></div>
          <div className="loading-text">Scanning option chains…</div>
          <div className="loading-subtext">NSE chains + TimesFM bands + realized vol (up to ~30s first load)</div>
        </div>
      ) : rows.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table straddle-table">
            <thead>
              <tr>
                <th>Underlying</th>
                <th>Expiry</th>
                <th>ATM</th>
                <th>Cost</th>
                <th>Breakeven</th>
                <th>IV</th>
                <th>Model σ</th>
                <th>Real σ</th>
                <th>Edge</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.underlying}>
                  <td><span className="ticker-link">{r.underlying}</span></td>
                  <td className="mono">{r.expiry?.slice(5)} <span className="card-meta">({r.dteDays}d)</span></td>
                  <td className="mono">{r.atmStrike?.toLocaleString('en-IN')}</td>
                  <td className="mono">₹{r.straddleCost?.toFixed(2)}</td>
                  <td className="mono">±{r.breakevenPct?.toFixed(2)}%</td>
                  <td className="mono">{r.atmIv != null ? `${r.atmIv.toFixed(1)}%` : '—'}</td>
                  <td className="mono">{r.tfmMovePct != null ? `±${r.tfmMovePct.toFixed(2)}%` : '—'}</td>
                  <td className="mono">{r.rvMovePct != null ? `±${r.rvMovePct.toFixed(2)}%` : '—'}</td>
                  <td className={`mono ${r.edge >= 1.15 ? 'positive' : r.edge < 0.85 ? 'negative' : ''}`}>
                    {r.edge?.toFixed(2)}×
                  </td>
                  <td>
                    <span className={`signal-badge ${r.verdict === 'EDGE' ? 'buy' : r.verdict === 'RICH' ? 'sell' : 'neutral'}`}>
                      {r.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">No chains right now</div>
          <div className="empty-desc">NSE blocked the request (common from cloud IPs). It retries automatically — check back in a few minutes.</div>
        </div>
      )}

      <div className="forecast-note" style={{ marginTop: '16px' }}>
        Model σ = TimesFM 20-day band ÷ 2.56, time-scaled to expiry. Real σ = 20-day
        realized volatility, time-scaled. Market σ = breakeven ÷ 0.8. Educational
        screener — options lose money fast; this is not financial advice.
      </div>
    </div>
  );
}
