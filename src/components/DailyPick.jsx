export default function DailyPick({ data, onAnalyzeStock, className = '' }) {
  if (!data || !data.pick) return null;

  const pick = data.pick;
  const action = (pick.investment_type || 'SWING').toUpperCase();
  const riskLevel = (pick.risk_level || 'MODERATE').toUpperCase();
  const riskClass = riskLevel === 'LOW' ? 'low' : riskLevel === 'HIGH' ? 'high' : 'moderate';
  const confidence = pick.confidence || 0;

  const scores = pick.scores || {};

  return (
    <div className={`card daily-pick fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="daily-pick-badge">🎯</span>
          Today's AI Investment Pick
        </div>
        <div className="daily-pick-meta">
          <span>{data.candidates_analyzed} stocks analyzed</span>
          <span className="meta-dot">·</span>
          <span>{new Date(data.timestamp).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      <div className="pick-header">
        <div>
          <div className="pick-ticker">{pick.best_ticker}</div>
          <div className="pick-name">{pick.name}</div>
        </div>
        <div className="pick-badges">
          <span className={`action-badge ${action.toLowerCase()}`}>{action}</span>
          <span className={`risk-badge ${riskClass}`}>
            {riskLevel === 'LOW' ? '🟢' : riskLevel === 'HIGH' ? '🔴' : '🟡'} {riskLevel}
          </span>
        </div>
      </div>

      <div className="pick-confidence">
        <div className="confidence-label">
          <span>AI Confidence</span>
          <span className="confidence-value">{confidence}%</span>
        </div>
        <div className="confidence-bar-container">
          <div
            className="confidence-bar"
            style={{ width: `${confidence}%`, background: getConfidenceGradient(confidence) }}
          ></div>
        </div>
      </div>

      <div className="pick-targets">
        <div className="target-item">
          <div className="target-label">Entry</div>
          <div className="target-value entry">₹{pick.entry_price?.toFixed(2) || '—'}</div>
        </div>
        <div className="target-item">
          <div className="target-label">Target</div>
          <div className="target-value target">₹{pick.target_price?.toFixed(2) || '—'}</div>
        </div>
        <div className="target-item">
          <div className="target-label">Stop Loss</div>
          <div className="target-value stoploss">₹{pick.stop_loss?.toFixed(2) || '—'}</div>
        </div>
        <div className="target-item">
          <div className="target-label">Risk/Reward</div>
          <div className="target-value rr">{pick.risk_reward_ratio?.toFixed(2) || '—'}</div>
        </div>
      </div>

      <div className="pick-horizon">
        <span>⏱️</span>
        Time Horizon: <strong>{pick.time_horizon}</strong>
        <span style={{ marginLeft: '16px' }}>📊 Position:</span>
        <strong>{pick.position_sizing || '5-10%'}</strong>
      </div>

      {pick.why_this_stock && (
        <div className="pick-section">
          <div className="section-subtitle">Why This Stock?</div>
          <p className="pick-thesis">{pick.why_this_stock}</p>
        </div>
      )}

      {pick.fundamental_thesis && (
        <div className="pick-section">
          <div className="section-subtitle">Fundamental Thesis</div>
          <p className="pick-thesis">{pick.fundamental_thesis}</p>
        </div>
      )}

      {pick.technical_thesis && (
        <div className="pick-section">
          <div className="section-subtitle">Technical Thesis</div>
          <p className="pick-thesis">{pick.technical_thesis}</p>
        </div>
      )}

      {pick.news_catalyst && (
        <div className="pick-section">
          <div className="section-subtitle">News Catalyst</div>
          <p className="pick-thesis">{pick.news_catalyst}</p>
        </div>
      )}

      <div className="pick-section">
        <div className="section-subtitle">Analysis Scores</div>
        <div className="pick-scores">
          {[
            { name: 'Fundamental', value: scores.fundamental_score },
            { name: 'Technical', value: scores.technical_score },
            { name: 'Sentiment', value: scores.sentiment_score },
            { name: 'Risk', value: scores.risk_score },
          ].map(s => (
            <div key={s.name} className="score-item">
              <div className="score-bar-wrap">
                <div className="score-name">{s.name}</div>
                <div className="score-bar">
                  <div
                    className="score-fill"
                    style={{ width: `${s.value || 0}%`, background: getScoreColor(s.value || 0) }}
                  ></div>
                </div>
              </div>
              <span className="score-value-num">{s.value || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {pick.key_risks && pick.key_risks.length > 0 && (
        <div className="pick-section">
          <div className="section-subtitle">Key Risks</div>
          <ul className="risk-list">
            {pick.key_risks.map((r, i) => (
              <li key={i} className="risk-item">
                <span className="risk-icon">⚠️</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pick.what_to_watch && pick.what_to_watch.length > 0 && (
        <div className="pick-section">
          <div className="section-subtitle">What to Watch</div>
          <ul className="factor-list">
            {pick.what_to_watch.map((w, i) => (
              <li key={i} className="factor-item">
                <span className="factor-icon">✓</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pick.exit_strategy && (
        <div className="pick-section">
          <div className="section-subtitle">Exit Strategy</div>
          <p className="pick-thesis">{pick.exit_strategy}</p>
        </div>
      )}

      <div className="pick-actions">
        <button className="btn-primary" onClick={onAnalyzeStock}>
          Deep Dive Analysis
        </button>
      </div>
    </div>
  );
}

function getScoreColor(value) {
  if (value >= 70) return 'var(--semantic-up)';
  if (value >= 40) return 'var(--primary)';
  return 'var(--semantic-down)';
}

function getConfidenceGradient(value) {
  if (value >= 70) return 'linear-gradient(90deg, #05b169, #00d26a)';
  if (value >= 40) return 'linear-gradient(90deg, #f4b000, #0052ff)';
  return 'linear-gradient(90deg, #cf202f, #f4b000)';
}
