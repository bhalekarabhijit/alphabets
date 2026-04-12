export default function AIRecommendation({ analysis, quote, className = '' }) {
  if (!analysis) return null;

  const action = (analysis.action || 'HOLD').toUpperCase();
  const actionClass = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : 'hold';
  const confidence = analysis.confidence || 0;
  const confidenceClass = confidence >= 70 ? 'high' : confidence >= 40 ? 'medium' : 'low';

  const riskLevel = (analysis.risk_level || 'MODERATE').toUpperCase();
  const riskClass = riskLevel === 'LOW' ? 'low' : riskLevel === 'HIGH' ? 'high' : 'moderate';

  const scores = analysis.scores || {};

  return (
    <div className={`glass-card ai-recommendation ${actionClass} fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">🤖</span>
          AI Recommendation
        </div>
        <span className={`risk-badge ${riskClass}`}>
          {riskLevel === 'LOW' ? '🟢' : riskLevel === 'HIGH' ? '🔴' : '🟡'} {riskLevel}
        </span>
      </div>

      {/* Verdict */}
      <div className="ai-verdict">
        <div className={`ai-action-badge ${actionClass}`}>
          {action === 'BUY' ? '📈' : action === 'SELL' ? '📉' : '⏸️'} {action}
        </div>
      </div>

      {/* Confidence */}
      <div className="ai-confidence">
        <div className="confidence-label">
          <span>Confidence</span>
          <span className="confidence-value">{confidence}%</span>
        </div>
        <div className="confidence-bar-container">
          <div
            className={`confidence-bar ${confidenceClass}`}
            style={{ width: `${confidence}%` }}
          ></div>
        </div>
      </div>

      {/* Price Targets */}
      <div className="ai-targets">
        <div className="target-item">
          <div className="target-label">Entry Price</div>
          <div className="target-value entry">
            ${analysis.entry_price?.toFixed(2) || quote?.price?.toFixed(2) || '—'}
          </div>
        </div>
        <div className="target-item">
          <div className="target-label">Target Price</div>
          <div className="target-value target">
            ${analysis.target_price?.toFixed(2) || '—'}
          </div>
        </div>
        <div className="target-item">
          <div className="target-label">Stop Loss</div>
          <div className="target-value stoploss">
            ${analysis.stop_loss?.toFixed(2) || '—'}
          </div>
        </div>
      </div>

      {/* Time Horizon */}
      {analysis.time_horizon && (
        <div className="time-horizon">
          <span className="time-icon">⏱️</span>
          Time Horizon: <strong>{analysis.time_horizon}</strong>
        </div>
      )}

      {/* Scores */}
      <div className="section-subtitle">Analysis Scores</div>
      <div className="ai-scores">
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
                  style={{
                    width: `${s.value || 0}%`,
                    background: getScoreColor(s.value || 0),
                  }}
                ></div>
              </div>
            </div>
            <span className="score-value-num">{s.value || 0}</span>
          </div>
        ))}
      </div>

      {/* Key Factors */}
      {analysis.key_factors && analysis.key_factors.length > 0 && (
        <div className="ai-factors">
          <div className="section-subtitle">Key Factors</div>
          <ul className="factor-list">
            {analysis.key_factors.map((f, i) => (
              <li key={i} className="factor-item">
                <span className="factor-icon">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {analysis.risks && analysis.risks.length > 0 && (
        <div className="ai-factors">
          <div className="section-subtitle">Risk Factors</div>
          <ul className="risk-list">
            {analysis.risks.map((r, i) => (
              <li key={i} className="risk-item">
                <span className="risk-icon">⚠️</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Math Analysis */}
      {analysis.math_analysis && (
        <>
          <div className="section-subtitle">Mathematical Analysis</div>
          <div className="math-grid">
            <div className="math-item">
              <div className="math-label">P/E vs Sector</div>
              <div className="math-value">{analysis.math_analysis.pe_vs_sector || 'N/A'}</div>
            </div>
            <div className="math-item">
              <div className="math-label">Fair Value</div>
              <div className="math-value">{analysis.math_analysis.price_vs_intrinsic || 'N/A'}</div>
            </div>
            <div className="math-item">
              <div className="math-label">Risk/Reward</div>
              <div className="math-value">{analysis.math_analysis.risk_reward_ratio || 'N/A'}</div>
            </div>
            <div className="math-item">
              <div className="math-label">Support / Resistance</div>
              <div className="math-value">{analysis.math_analysis.support_resistance || 'N/A'}</div>
            </div>
          </div>
        </>
      )}

      {/* Detailed Analysis */}
      {analysis.detailed_analysis && (
        <div className="ai-detailed-analysis">
          <div className="section-subtitle" style={{ marginTop: 0 }}>Detailed Analysis</div>
          {analysis.detailed_analysis.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function getScoreColor(value) {
  if (value >= 70) return 'linear-gradient(90deg, #10b981, #06b6d4)';
  if (value >= 40) return 'linear-gradient(90deg, #f59e0b, #6366f1)';
  return 'linear-gradient(90deg, #ef4444, #f59e0b)';
}
