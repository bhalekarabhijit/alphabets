import { useState, useEffect, useRef } from 'react';

export default function SearchBar({ onAnalyze, apiBase, loading }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTickers = async (q) => {
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setSuggestions(data.data);
        setShowSuggestions(true);
      }
    } catch {
      // silent fail
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTickers(val), 300);
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
    <div className="search-section" ref={wrapperRef}>
      <form className="search-container" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            id="stock-search-input"
            className="search-input"
            type="text"
            placeholder="Search stock ticker (e.g., AAPL, GOOGL, MSFT)..."
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
