import { useState, useEffect } from 'react';

// Recently-listed NSE stocks (IPOs), from NSE listing dates in the universe
// file (refreshed weekly). Click to analyze — Yahoo usually has quotes
// within a day or two of listing.
export default function NewListings({ apiBase, onAnalyze, className = '' }) {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    fetch(`${apiBase}/new-listings?days=30`)
      .then(r => r.json())
      .then(j => { if (j.success) setListings(j.data.slice(0, 8)); })
      .catch(() => {});
  }, [apiBase]);

  if (!listings || listings.length === 0) return null;

  return (
    <div className={`new-listings fade-in ${className}`}>
      <div className="new-listings-title">🆕 Listed in the last 30 days</div>
      <div className="new-listings-row">
        {listings.map(s => (
          <button key={s.symbol} className="new-listing-chip" onClick={() => onAnalyze(s.symbol)}>
            <span className="mono">{s.symbol.replace('.NS', '')}</span>
            <span className="card-meta">{s.listingDate?.slice(5)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
