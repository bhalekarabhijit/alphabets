import { useState, useEffect } from 'react';

const LS_KEY = 'alphabets_watchlist';

// Portfolio tab: reads the same watchlist (holdings stay in sync),
// one LLM call turns them into a morning brief.
export default function Portfolio({ apiBase, onAnalyze, className = '' }) {
  const [holdings, setHoldings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  const add = () => {
    const t = input.trim().toUpperCase();
    if (t && !holdings.includes(t)) setHoldings([...holdings, t]);
    setInput('');
  };

  const getBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/portfolio/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: holdings }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setBrief(j.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">Portfolio Brief</div>
        <span className="card-meta">{holdings.length} holding{holdings.length === 1 ? '' : 's'}</span>
      </div>

      <div className="watchlist-input-row">
        <input
          className="input-pill"
          type="text"
          placeholder="Add holding (e.g. RELIANCE.NS)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          maxLength={12}
        />
        <button className="btn-secondary btn-sm" onClick={add}>+ Add</button>
      </div>

      {holdings.length > 0 && (
        <div className="holding-chips">
          {holdings.map(h => (
            <span key={h} className="holding-chip" onClick={() => onAnalyze(h)} title="Analyze">
              {h}
              <button
                className="btn-icon"
                title="Remove"
                onClick={(e) => { e.stopPropagation(); setHoldings(holdings.filter(x => x !== h)); }}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={getBrief}
        disabled={loading || holdings.length === 0}
        style={{ marginTop: '12px' }}
      >
        {loading ? 'Briefing…' : '☀️ Get morning brief'}
      </button>

      {error && <div className="refresh-status error" style={{ marginTop: '12px' }}>{error}</div>}

      {brief && !loading && (
        <div className="brief-result">
          <p className="pick-thesis">{brief.brief?.summary}</p>

          {(brief.brief?.per_ticker || []).map(pt => (
            <div key={pt.ticker} className="pick-row" onClick={() => onAnalyze(pt.ticker)}>
              <div className="pick-info">
                <div className="pick-symbol">{pt.ticker}</div>
                <div className="pick-name-sm">{pt.one_liner}</div>
              </div>
              <span className={`signal-badge ${stanceClass(pt.stance)}`}>{pt.stance}</span>
              <div className="pick-cta">→</div>
            </div>
          ))}

          {(brief.brief?.actions?.length > 0) && (
            <>
              <div className="section-subtitle">Top actions</div>
              <ul className="factor-list">
                {brief.brief.actions.map((a, i) => (
                  <li key={i} className="factor-item"><span className="factor-icon">→</span><span>{a}</span></li>
                ))}
              </ul>
            </>
          )}

          {(brief.brief?.risks?.length > 0) && (
            <>
              <div className="section-subtitle">Watch out</div>
              <ul className="risk-list">
                {brief.brief.risks.map((r, i) => (
                  <li key={i} className="risk-item"><span className="risk-icon">⚠️</span><span>{r}</span></li>
                ))}
              </ul>
            </>
          )}

          <div className="forecast-note" style={{ marginTop: '12px' }}>
            Brief over {brief.items?.length || 0} holdings · {brief.asOf ? new Date(brief.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''} ·
            educational, not advice.
          </div>
        </div>
      )}

      {holdings.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">💼</div>
          <div className="empty-title">No holdings yet</div>
          <div className="empty-desc">Add the stocks you hold (or watch) — same list as the Watchlist Scanner — and get a one-shot morning brief.</div>
        </div>
      )}
    </div>
  );
}

function stanceClass(s) {
  if (s === 'ADD') return 'buy';
  if (s === 'TRIM') return 'sell';
  return 'neutral';
}
