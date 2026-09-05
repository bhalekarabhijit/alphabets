import { useState, useEffect } from 'react';

// TimesFM 20-day forecast card. Fetches its own data; renders nothing
// when no nightly forecast exists for the ticker (graceful degradation).
export default function TimesFMForecast({ ticker, apiBase, className = '' }) {
  const [fc, setFc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFc(null);
    if (!ticker) return;
    fetch(`${apiBase}/forecast/${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(j => { if (!cancelled && j.success) setFc(j.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker, apiBase]);

  if (!fc) return null;

  const expRet = fc.expected_return_pct ?? 0;
  const positive = expRet >= 0;
  const genDate = fc.generated_at
    ? new Date(fc.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';

  return (
    <div className={`card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">TimesFM Forecast</div>
        <span className="card-meta">Google AI · 20 trading days · {genDate}</span>
      </div>

      <div className="forecast-hero">
        <div>
          <div className="meta-label">Expected move</div>
          <div className={`forecast-exp ${positive ? 'positive' : 'negative'}`}>
            {positive ? '▲' : '▼'} {Math.abs(expRet).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="meta-label">Target (p50)</div>
          <div className="forecast-target">₹{fc.target_20d?.toFixed(2)}</div>
        </div>
        <div>
          <div className="meta-label">Range (p10–p90)</div>
          <div className="forecast-range mono">
            ₹{fc.p10?.[fc.p10.length - 1]?.toFixed(0)} – ₹{fc.p90?.[fc.p90.length - 1]?.toFixed(0)}
          </div>
        </div>
      </div>

      <ForecastBand p10={fc.p10} p50={fc.p50} p90={fc.p90} lastClose={fc.last_close} />

      <div className="forecast-note">
        Zero-shot forecast by Google TimesFM 2.5 from the last close of ₹{fc.last_close?.toFixed(2)}.
        Bands show the 10th–90th percentile range — not financial advice.
      </div>
    </div>
  );
}

function ForecastBand({ p10, p50, p90, lastClose }) {
  if (!p10 || !p50 || !p90 || p10.length === 0) return null;

  const W = 600, H = 140, PAD = 10;
  const all = [...p10, ...p50, ...p90, lastClose];
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const n = p50.length;

  const x = (i) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const y = (v) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const line = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(p90)} ${p10.map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(p10[n - 1 - i]).toFixed(1)}`).join(' ')} Z`;
  const up = p50[n - 1] >= lastClose;
  const stroke = up ? 'var(--semantic-up)' : 'var(--semantic-down)';

  return (
    <svg className="forecast-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={area} fill="var(--primary)" opacity="0.10" />
      <path d={line(p50)} fill="none" stroke={stroke} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={line(p90)} fill="none" stroke="var(--muted-soft)" strokeWidth="1"
        strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <path d={line(p10)} fill="none" stroke="var(--muted-soft)" strokeWidth="1"
        strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <line x1={PAD} y1={y(lastClose)} x2={W - PAD} y2={y(lastClose)}
        stroke="var(--muted-soft)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
