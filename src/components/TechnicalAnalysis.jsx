import { useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  TimeScale,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  TimeScale,
  Filler,
  Legend,
  Tooltip
);

export default function TechnicalAnalysis({
  technicals,
  chartData,
  chartIndicators,
  ticker,
  className = '',
}) {
  const [showSMA, setShowSMA] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);

  if (!technicals || !chartData) return null;

  const labels = chartData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  // Build datasets
  const datasets = [
    {
      label: ticker,
      data: chartData.map(d => d.close),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99, 102, 241, 0.05)',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.1,
      order: 1,
    },
  ];

  if (showSMA && chartIndicators?.sma20) {
    datasets.push({
      label: 'SMA 20',
      data: chartIndicators.sma20,
      borderColor: '#f59e0b',
      borderWidth: 1.5,
      pointRadius: 0,
      borderDash: [],
      fill: false,
      tension: 0.1,
      order: 2,
    });
  }

  if (showSMA && chartIndicators?.sma50) {
    datasets.push({
      label: 'SMA 50',
      data: chartIndicators.sma50,
      borderColor: '#10b981',
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0.1,
      order: 2,
    });
  }

  if (showSMA && chartIndicators?.sma200) {
    datasets.push({
      label: 'SMA 200',
      data: chartIndicators.sma200,
      borderColor: '#ef4444',
      borderWidth: 1.5,
      pointRadius: 0,
      borderDash: [5, 5],
      fill: false,
      tension: 0.1,
      order: 2,
    });
  }

  if (showBollinger && chartIndicators?.bollinger) {
    datasets.push(
      {
        label: 'BB Upper',
        data: chartIndicators.bollinger.map(b => b?.upper || null),
        borderColor: 'rgba(139, 92, 246, 0.5)',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0.1,
        order: 3,
      },
      {
        label: 'BB Lower',
        data: chartIndicators.bollinger.map(b => b?.lower || null),
        borderColor: 'rgba(139, 92, 246, 0.5)',
        borderWidth: 1,
        pointRadius: 0,
        fill: '-1',
        backgroundColor: 'rgba(139, 92, 246, 0.05)',
        tension: 0.1,
        order: 3,
      }
    );
  }

  const chartConfig = {
    labels,
    datasets,
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter' },
          usePointStyle: true,
          pointStyle: 'line',
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { family: 'JetBrains Mono', size: 12 },
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        callbacks: {
          label: function(context) {
            const val = context.parsed.y;
            if (val !== null) {
              return `${context.dataset.label}: $${val.toFixed(2)}`;
            }
            return null;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        ticks: {
          color: '#475569',
          font: { size: 10 },
          maxTicksLimit: 12,
          maxRotation: 0,
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.05)',
        },
      },
      y: {
        display: true,
        position: 'right',
        ticks: {
          color: '#475569',
          font: { size: 10, family: 'JetBrains Mono' },
          callback: val => '$' + val.toFixed(0),
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.05)',
        },
      },
    },
  };

  const signals = technicals.signals || {};
  const individual = signals.individual || [];
  const summary = signals.summary || {};

  return (
    <div className={`glass-card fade-in ${className}`}>
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">📈</span>
          Technical Analysis
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`period-tab ${showSMA ? 'active' : ''}`}
            onClick={() => setShowSMA(!showSMA)}
          >
            SMA
          </button>
          <button
            className={`period-tab ${showBollinger ? 'active' : ''}`}
            onClick={() => setShowBollinger(!showBollinger)}
          >
            BB
          </button>
        </div>
      </div>

      {/* Price Chart */}
      <div className="chart-container">
        <Line data={chartConfig} options={chartOptions} />
      </div>

      {/* Signal Summary Bar */}
      <div className="signal-summary-bar">
        <span className="signal-count buy-count">▲ {summary.buy || 0} Buy</span>
        <span className="signal-count sell-count">▼ {summary.sell || 0} Sell</span>
        <span className="signal-count neutral-count">● {summary.neutral || 0} Neutral</span>
        <span className={`overall-signal ${
          summary.overall === 'BUY' ? 'positive' : summary.overall === 'SELL' ? 'negative' : ''
        }`}>
          {summary.overall || 'NEUTRAL'}
        </span>
      </div>

      {/* Individual Signals */}
      <div className="signals-grid">
        {individual.map((sig, i) => (
          <div
            key={i}
            className={`signal-card ${
              sig.signal === 'BUY' ? 'buy-signal' :
              sig.signal === 'SELL' ? 'sell-signal' : 'neutral-signal'
            }`}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="signal-indicator-name">{sig.indicator}</span>
                <span className={`signal-badge ${sig.signal.toLowerCase()}`}>
                  {sig.signal}
                </span>
              </div>
              <div className="signal-reason">{sig.reason}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Indicator Values */}
      <div style={{ marginTop: '16px' }}>
        <div className="section-subtitle">Current Indicator Values</div>
        <div className="stock-meta-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="meta-item">
            <div className="meta-label">RSI (14)</div>
            <div className={`meta-value ${
              technicals.current?.rsi < 30 ? 'positive' :
              technicals.current?.rsi > 70 ? 'negative' : ''
            }`}>
              {technicals.current?.rsi?.toFixed(1) || '—'}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">MACD</div>
            <div className={`meta-value ${
              technicals.current?.macd?.histogram > 0 ? 'positive' : 'negative'
            }`}>
              {technicals.current?.macd?.histogram?.toFixed(2) || '—'}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">ATR (14)</div>
            <div className="meta-value">
              ${technicals.current?.atr?.toFixed(2) || '—'}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Stochastic K</div>
            <div className="meta-value">
              {technicals.current?.stochastic?.k?.toFixed(1) || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
