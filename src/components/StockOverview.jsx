export default function StockOverview({ quote, className = '' }) {
  if (!quote) return null;

  const isPositive = quote.change >= 0;
  const changeClass = isPositive ? 'positive' : 'negative';
  const changeIcon = isPositive ? '▲' : '▼';

  // 52-week position (0-100)
  const weekRange = quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow;
  const weekPosition = weekRange > 0
    ? ((quote.price - quote.fiftyTwoWeekLow) / weekRange) * 100
    : 50;

  // Volume ratio
  const volumeRatio = quote.avgVolume > 0 ? (quote.volume / quote.avgVolume) * 100 : 0;

  return (
    <div className={`glass-card stock-overview fade-in ${className}`}>
      <div className="stock-name">{quote.name}</div>
      <div className="stock-ticker-row">
        <span className="stock-ticker">{quote.symbol}</span>
        <span className="stock-exchange">{quote.exchange} · {quote.currency}</span>
      </div>

      <div className="stock-price-row">
        <span className={`stock-price ${changeClass}`}>
          ${quote.price?.toFixed(2)}
        </span>
        <span className={`stock-change ${changeClass}`}>
          {changeIcon} {Math.abs(quote.change)?.toFixed(2)} ({Math.abs(quote.changePercent)?.toFixed(2)}%)
        </span>
      </div>

      <div className="stock-meta-grid">
        <div className="meta-item">
          <div className="meta-label">Market Cap</div>
          <div className="meta-value">{formatLargeNumber(quote.marketCap)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Day Range</div>
          <div className="meta-value">
            ${quote.low?.toFixed(2)} - ${quote.high?.toFixed(2)}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Volume</div>
          <div className="meta-value">{formatLargeNumber(quote.volume)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Open</div>
          <div className="meta-value">${quote.open?.toFixed(2)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Prev Close</div>
          <div className="meta-value">${quote.prevClose?.toFixed(2)}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Avg Volume</div>
          <div className="meta-value">{formatLargeNumber(quote.avgVolume)}</div>
        </div>
      </div>

      {/* 52-Week Gauge */}
      <div className="week52-gauge">
        <div className="gauge-title">52-Week Range</div>
        <div className="gauge-track">
          <div className="gauge-fill" style={{ width: '100%' }}></div>
          <div className="gauge-marker" style={{ left: `${weekPosition}%` }}></div>
        </div>
        <div className="gauge-labels">
          <span className="gauge-low">${quote.fiftyTwoWeekLow?.toFixed(2)}</span>
          <span className="gauge-high">${quote.fiftyTwoWeekHigh?.toFixed(2)}</span>
        </div>
      </div>

      {/* Volume Indicator */}
      <div style={{ marginTop: '12px' }}>
        <div className="meta-label">Volume vs Average</div>
        <div className="volume-indicator">
          <div className="volume-bar-bg">
            <div
              className="volume-bar-fill"
              style={{ width: `${Math.min(volumeRatio, 200) / 2}%` }}
            ></div>
          </div>
          <span className="volume-label">{volumeRatio.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function formatLargeNumber(num) {
  if (!num) return 'N/A';
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toLocaleString();
}
