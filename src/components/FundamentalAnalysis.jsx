export default function FundamentalAnalysis({ fundamentals, className = '' }) {
  if (!fundamentals) return null;

  const categories = [
    {
      title: 'Valuation',
      metrics: [
        { name: 'P/E (TTM)', value: fundamentals.trailingPE, format: 'number', good: v => v > 0 && v < 25 },
        { name: 'Forward P/E', value: fundamentals.forwardPE, format: 'number', good: v => v > 0 && v < 20 },
        { name: 'PEG Ratio', value: fundamentals.pegRatio, format: 'number', good: v => v > 0 && v < 1.5 },
        { name: 'P/B Ratio', value: fundamentals.priceToBook, format: 'number', good: v => v > 0 && v < 3 },
        { name: 'P/S Ratio', value: fundamentals.priceToSales, format: 'number', good: v => v > 0 && v < 5 },
        { name: 'EV/EBITDA', value: fundamentals.evToEbitda, format: 'number', good: v => v > 0 && v < 15 },
        { name: 'EV/Revenue', value: fundamentals.evToRevenue, format: 'number' },
      ],
    },
    {
      title: 'Profitability',
      metrics: [
        { name: 'Gross Margin', value: fundamentals.grossMargin, format: 'percent', good: v => v > 0.4 },
        { name: 'EBITDA Margin', value: fundamentals.ebitdaMargin, format: 'percent', good: v => v > 0.2 },
        { name: 'Operating Margin', value: fundamentals.operatingMargin, format: 'percent', good: v => v > 0.15 },
        { name: 'Net Margin', value: fundamentals.profitMargin, format: 'percent', good: v => v > 0.1 },
        { name: 'ROE', value: fundamentals.returnOnEquity, format: 'percent', good: v => v > 0.15 },
        { name: 'ROA', value: fundamentals.returnOnAssets, format: 'percent', good: v => v > 0.05 },
      ],
    },
    {
      title: 'Growth',
      metrics: [
        { name: 'Revenue Growth', value: fundamentals.revenueGrowth, format: 'percent', good: v => v > 0.1 },
        { name: 'Earnings Growth', value: fundamentals.earningsGrowth, format: 'percent', good: v => v > 0.1 },
        { name: 'EPS (TTM)', value: fundamentals.eps, format: 'dollar' },
        { name: 'Forward EPS', value: fundamentals.forwardEps, format: 'dollar' },
      ],
    },
    {
      title: 'Financial Health',
      metrics: [
        { name: 'Debt/Equity', value: fundamentals.debtToEquity, format: 'number', good: v => v < 100 },
        { name: 'Current Ratio', value: fundamentals.currentRatio, format: 'number', good: v => v > 1.5 },
        { name: 'Quick Ratio', value: fundamentals.quickRatio, format: 'number', good: v => v > 1 },
        { name: 'Total Cash', value: fundamentals.totalCash, format: 'large' },
        { name: 'Total Debt', value: fundamentals.totalDebt, format: 'large' },
        { name: 'Book Value', value: fundamentals.bookValue, format: 'dollar' },
      ],
    },
    {
      title: 'Dividends',
      metrics: [
        { name: 'Dividend Yield', value: fundamentals.dividendYield, format: 'percent' },
        { name: 'Payout Ratio', value: fundamentals.payoutRatio, format: 'percent', good: v => v < 0.6 },
      ],
    },
    {
      title: 'Analyst Consensus',
      metrics: [
        { name: 'Target Price', value: fundamentals.targetMeanPrice, format: 'dollar' },
        { name: 'Target High', value: fundamentals.targetHighPrice, format: 'dollar' },
        { name: 'Target Low', value: fundamentals.targetLowPrice, format: 'dollar' },
        { name: 'Rating', value: fundamentals.recommendationKey, format: 'text' },
        { name: 'Beta', value: fundamentals.beta, format: 'number' },
        { name: 'Short Ratio', value: fundamentals.shortRatio, format: 'number' },
      ],
    },
  ];

  return (
    <div className={`glass-card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">📋</span>
          Fundamental Analysis
        </div>
      </div>

      <div className="fundamentals-grid">
        {categories.map(cat => (
          <div key={cat.title} className="fundamental-category">
            <div className="category-title">{cat.title}</div>
            {cat.metrics.map(m => {
              const formatted = formatValue(m.value, m.format);
              const colorClass = getValueColorClass(m.value, m.good);
              return (
                <div key={m.name} className="metric-row">
                  <span className="metric-name">{m.name}</span>
                  <span className={`metric-value ${colorClass}`}>{formatted}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(val, format) {
  if (val === null || val === undefined) return '—';

  switch (format) {
    case 'percent':
      return (val * 100).toFixed(1) + '%';
    case 'dollar':
      return '₹' + Number(val).toFixed(2);
    case 'number':
      return Number(val).toFixed(2);
    case 'large':
      return formatLargeNumber(val);
    case 'text':
      return String(val).toUpperCase();
    default:
      return String(val);
  }
}

function formatLargeNumber(num) {
  if (!num) return '—';
  if (num >= 1e12) return '₹' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '₹' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '₹' + (num / 1e6).toFixed(0) + 'M';
  return '₹' + num.toLocaleString();
}

function getValueColorClass(val, goodFn) {
  if (val === null || val === undefined || !goodFn) return '';
  return goodFn(val) ? 'metric-good' : 'metric-bad';
}
