import { useState, useEffect } from 'react';

const DEFAULT_WATCHLIST = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];

export default function WatchlistScanner({ onSelectTicker, apiBase }) {
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('alphabets_watchlist');
      return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST;
    } catch {
      return DEFAULT_WATCHLIST;
    }
  });
  const [newTicker, setNewTicker] = useState('');
  const [scanResults, setScanResults] = useState([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    localStorage.setItem('alphabets_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const addTicker = () => {
    const ticker = newTicker.trim().toUpperCase();
    if (ticker && !watchlist.includes(ticker)) {
      setWatchlist([...watchlist, ticker]);
      setNewTicker('');
    }
  };

  const removeTicker = (ticker) => {
    setWatchlist(watchlist.filter(t => t !== ticker));
    setScanResults(scanResults.filter(r => r.ticker !== ticker));
  };

  const scanWatchlist = async () => {
    setScanning(true);
    try {
      const response = await fetch(`${apiBase}/watchlist/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: watchlist }),
      });
      const result = await response.json();
      if (result.success) {
        setScanResults(result.data);
      }
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') addTicker();
  };

  return (
    <div className="card fade-in">
      <div className="card-header">
        <div className="card-title">Watchlist Scanner</div>
        <span className="card-meta">{watchlist.length} stocks</span>
      </div>

      <div className="watchlist-input-row">
        <input
          id="watchlist-ticker-input"
          className="input-pill"
          type="text"
          placeholder="Add ticker (e.g. RELIANCE.NS)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={10}
        />
        <button
          id="watchlist-add-button"
          className="btn-secondary"
          onClick={addTicker}
        >
          + Add
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>Change</th>
            <th>Signal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {watchlist.map(ticker => {
            const result = scanResults.find(r => r.ticker === ticker);
            return (
              <tr key={ticker}>
                <td>
                  <span
                    className="ticker-link"
                    onClick={() => onSelectTicker(ticker)}
                  >
                    {ticker}
                  </span>
                </td>
                <td className="mono">
                  {result?.price ? `₹${result.price.toFixed(2)}` : '—'}
                </td>
                <td>
                  {result?.change != null ? (
                    <span className={result.change >= 0 ? 'positive' : 'negative'}>
                      {result.change >= 0 ? '+' : ''}{result.change.toFixed(2)}%
                    </span>
                  ) : '—'}
                </td>
                <td>
                  {result?.signal ? (
                    <span className={`signal-badge ${result.signal.toLowerCase()}`}>
                      {result.signal}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => removeTicker(ticker)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        id="scan-watchlist-button"
        className="btn-primary"
        onClick={scanWatchlist}
        disabled={scanning || watchlist.length === 0}
      >
        {scanning ? 'Scanning...' : 'Scan Watchlist'}
      </button>
    </div>
  );
}
