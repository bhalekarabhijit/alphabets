import { useState } from 'react';

// Terminal command bar: natural-language questions answered from live
// market context (board movers, TimesFM picks, your holdings).
// Mentioned tickers become one-click deep-dives.
export default function CommandBar({ apiBase, onAnalyze, className = '' }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  const holdings = (() => {
    try {
      return JSON.parse(localStorage.getItem('alphabets_watchlist') || '[]');
    } catch {
      return [];
    }
  })();

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || loading) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch(`${apiBase}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, tickers: holdings }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setAnswer(j.data);
    } catch (e) {
      setAnswer({ answer: `Couldn't answer that: ${e.message}`, tickers: [] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`command-bar ${className}`}>
      <div className="search-input-wrapper">
        <span className="search-icon">✨</span>
        <input
          className="search-input"
          type="text"
          placeholder="Ask about the market… e.g. what's moving today?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          maxLength={200}
        />
        <button className="search-btn" onClick={() => ask()} disabled={loading || !q.trim()}>
          {loading ? '…' : 'Ask'}
        </button>
      </div>

      {answer && !loading && (
        <div className="command-answer fade-in">
          <p>{answer.answer}</p>
          {(answer.tickers || []).length > 0 && (
            <div className="holding-chips" style={{ marginTop: '8px', marginBottom: 0 }}>
              {answer.tickers.slice(0, 6).map(t => (
                <span key={t} className="holding-chip" onClick={() => onAnalyze(t)}>
                  {t} →
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
