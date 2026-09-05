import { useState, useEffect, useCallback } from 'react';

// TimesFM Recommendations page: nightly model picks per index universe,
// with a one-click button to trigger a fresh workflow run.
export default function Recommendations({ apiBase, onAnalyze, className = '' }) {
  const [universes, setUniverses] = useState([]);
  const [universe, setUniverse] = useState('nifty50');
  const [picks, setPicks] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [universeSize, setUniverseSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshState, setRefreshState] = useState(null); // { type, text }

  const loadPicks = useCallback(async (u) => {
    try {
      const res = await fetch(`${apiBase}/timesfm-picks?universe=${u}`);
      const j = await res.json();
      if (j.success) {
        setPicks(j.data.picks || []);
        setGeneratedAt(j.data.generated_at);
        setUniverseSize(j.data.universe_size || 0);
      } else {
        setPicks([]);
        setGeneratedAt(null);
        setUniverseSize(0);
      }
    } catch {
      setPicks([]);
    }
  }, [apiBase]);

  useEffect(() => {
    fetch(`${apiBase}/universes`)
      .then(r => r.json())
      .then(j => { if (j.success) setUniverses(j.data); })
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    setLoading(true);
    loadPicks(universe).finally(() => setLoading(false));
    const t = setInterval(() => loadPicks(universe), 60000); // pick up fresh runs
    return () => clearInterval(t);
  }, [universe, loadPicks]);

  const triggerRefresh = async () => {
    setRefreshState({ type: 'pending', text: 'Starting forecast run…' });
    try {
      const res = await fetch(`${apiBase}/forecast/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universe }),
      });
      const j = await res.json();
      if (j.success) {
        setRefreshState({ type: 'ok', text: j.message });
      } else {
        setRefreshState({ type: 'error', text: j.error });
      }
    } catch (e) {
      setRefreshState({ type: 'error', text: `Could not reach server: ${e.message}` });
    }
  };

  const active = universes.find(u => u.id === universe);
  const genLabel = generatedAt
    ? new Date(generatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className={`card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">TimesFM Recommendations</div>
        <button className="btn btn-primary btn-sm" onClick={triggerRefresh}>
          ↻ Refresh forecasts
        </button>
      </div>

      <div className="universe-pills">
        {(universes.length ? universes : [{ id: 'nifty50', label: 'Nifty 50', available: false }]).map(u => (
          <button
            key={u.id}
            className={`period-tab ${universe === u.id ? 'active' : ''}`}
            onClick={() => setUniverse(u.id)}
          >
            {u.label}{u.available === false ? ' ·' : ''}
          </button>
        ))}
      </div>

      {refreshState && (
        <div className={`refresh-status ${refreshState.type}`}>
          {refreshState.text}
        </div>
      )}

      {active && (
        <div className="card-meta" style={{ marginBottom: '12px' }}>
          {active.description}
          {genLabel ? ` · Updated ${genLabel} · ${universeSize} stocks scored` : ' · No forecasts yet'}
        </div>
      )}

      {loading ? (
        <div className="loading-container" style={{ padding: '40px 20px' }}>
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading picks…</div>
        </div>
      ) : picks && picks.length > 0 ? (
        <div className="picks-list">
          {picks.map(p => {
            const exp = p.expected_return_pct ?? 0;
            const positive = exp >= 0;
            return (
              <div key={p.symbol} className="pick-row" onClick={() => onAnalyze(p.ticker || `${p.symbol}.NS`)}>
                <div className="pick-rank">#{p.rank}</div>
                <div className="pick-info">
                  <div className="pick-symbol">{p.symbol}</div>
                  <div className="pick-name-sm">{p.name || ''}</div>
                </div>
                <div className="pick-numbers">
                  <div className="mono">₹{p.last_close?.toFixed(2)}</div>
                  <div className={`mono ${positive ? 'positive' : 'negative'}`}>
                    {positive ? '+' : ''}{exp.toFixed(1)}%
                  </div>
                </div>
                <div className="pick-band">
                  <div className="pick-band-bar">
                    <div
                      className="pick-band-fill"
                      style={{
                        left: `${bandLeft(p)}%`,
                        width: `${bandWidth(p)}%`,
                      }}
                    />
                    <div className="pick-band-marker" style={{ left: `${bandMarker(p)}%` }} />
                  </div>
                  <div className="pick-band-labels mono">
                    <span>₹{p.p10?.[p.p10.length - 1]?.toFixed(0)}</span>
                    <span>₹{p.target_20d?.toFixed(0)}</span>
                    <span>₹{p.p90?.[p.p90.length - 1]?.toFixed(0)}</span>
                  </div>
                </div>
                <div className="pick-cta">→</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📈</div>
          <div className="empty-title">No forecasts yet</div>
          <div className="empty-desc">
            Forecasts for {active?.label || universe} haven't been generated.
            Hit <strong>Refresh forecasts</strong> above — a free GitHub run takes ~10 minutes,
            then picks appear here automatically.
          </div>
        </div>
      )}

      <div className="forecast-note" style={{ marginTop: '16px' }}>
        Ranked by risk-adjusted 20-day expected return from Google TimesFM 2.5
        (p50 target ÷ band width). Runs are free and unlimited on this public repo —
        each takes ~5–12 min. Forecasts refresh nightly after market close.
      </div>
    </div>
  );
}

// Band bar geometry: normalize [downside, upside] around 0 for the row.
function bandRange(p) {
  const lo = Math.min(p.downside_pct ?? 0, p.expected_return_pct ?? 0, 0);
  const hi = Math.max(p.upside_pct ?? 0, p.expected_return_pct ?? 0, 0);
  return { lo: Math.min(lo, -1), hi: Math.max(hi, 1) };
}
function bandLeft(p) {
  const { lo, hi } = bandRange(p);
  return ((Math.min(p.downside_pct ?? 0, 0) - lo) / (hi - lo)) * 100;
}
function bandWidth(p) {
  const { lo, hi } = bandRange(p);
  const w = ((Math.max(p.upside_pct ?? 0, 0) - Math.min(p.downside_pct ?? 0, 0)) / (hi - lo)) * 100;
  return Math.max(w, 6);
}
function bandMarker(p) {
  const { lo, hi } = bandRange(p);
  return (((p.expected_return_pct ?? 0) - lo) / (hi - lo)) * 100;
}
