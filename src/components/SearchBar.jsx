import { useState, useEffect, useRef } from 'react';

export default function SearchBar({ onAnalyze, apiBase, loading }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTickers = async (q) => {
    if (q.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Local NSE index endpoint is <1ms. Use AbortController to discard stale
    // responses and never let a slower Yahoo fallback delay the UI.
    try {
      // 2.5s is deliberately generous to the server; normal local search
      // returns before this timeout and cancels any stale render.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(q)}&fast=1`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data);
        setShowSuggestions(true);
      }
    } catch {
      // Local endpoint should never need a fallback UI to work.
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);

    // Name/symbol search is local, so 15ms is imperceptible and keeps
    // results available on every keystroke without UI jitter.
    debounceRef.current = setTimeout(() => searchTickers(val), 15);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      onAnalyze(query.trim().toUpperCase());
    }
  };

  const selectSuggestion = (symbol) => {
    setQuery(symbol);
    setShowSuggestions(false);
    onAnalyze(symbol);
  };

  return (
    <div className="search-container" ref={wrapperRef}>
      <form onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            id="stock-search-input"
            className="search-input"
            type="text"
            placeholder="Search any NSE/BSE stock..."
            value={query}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            autoComplete="off"
          />
          <button
            id="analyze-button"
            className="search-btn"
            type="submit"
            disabled={loading || !query.trim()}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map((s) => (
              <div
                key={s.symbol}
                className="search-suggestion-item"
                onClick={() => selectSuggestion(s.symbol)}
              >
                <div>
                  <span className="suggestion-symbol">{s.symbol}</span>
                  <span className="suggestion-name">{s.name}</span>
                </div>
                <span className="suggestion-exchange">{s.exchange}</span>
              </div>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
