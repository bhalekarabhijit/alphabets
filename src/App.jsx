import { useState, useCallback, useEffect } from 'react';
import SearchBar from './components/SearchBar';
import StockOverview from './components/StockOverview';
import AIRecommendation from './components/AIRecommendation';
import FundamentalAnalysis from './components/FundamentalAnalysis';
import TechnicalAnalysis from './components/TechnicalAnalysis';
import NewsFeed from './components/NewsFeed';
import WatchlistScanner from './components/WatchlistScanner';
import TimesFMForecast from './components/TimesFMForecast';
import Recommendations from './components/Recommendations';
import DailyPick from './components/DailyPick';
import './index.css';

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://alphabets-ap.onrender.com/api').replace(/\/+$/, '');

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [dailyPickData, setDailyPickData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTicker, setCurrentTicker] = useState('');
  const [view, setView] = useState('analyze');
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('alphabets_dark') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('alphabets_dark', darkMode); } catch {}
  }, [darkMode]);

  const analyzeStock = useCallback(async (ticker) => {
    setLoading(true);
    setError(null);
    setCurrentTicker(ticker);
    setDailyPickData(null);

    try {
      const response = await fetch(`${API_BASE}/analyze/${ticker}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      setAnalysisData({ ...result.data, synthetic: result.synthetic });
    } catch (err) {
      setError(err.message);
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDailyPick = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysisData(null);

    try {
      const response = await fetch(`${API_BASE}/daily-pick`);
      const result = await response.json();

      if (!result.success || !result.data.pick) {
        throw new Error(result.error || 'Failed to fetch daily pick');
      }

      setDailyPickData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeDailyPickStock = useCallback(async () => {
    if (dailyPickData?.pick?.best_ticker) {
      await analyzeStock(dailyPickData.pick.best_ticker);
    }
  }, [dailyPickData, analyzeStock]);

  return (
    <div className="app">
      {/* Top Navigation */}
      <header className="header">
        <div className="header-brand">
          <svg className="header-logo" viewBox="0 0 100 100" width="32" height="32">
            <defs>
              <linearGradient id="logo-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0052ff"/>
                <stop offset="100%" stopColor="#0038d4"/>
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="22" fill="url(#logo-bg)"/>
            <path d="M50 16 L78 84 L68 84 L62 64 L38 64 L32 84 L22 84 Z" fill="white"/>
            <path d="M50 32 L58 56 L42 56 Z" fill="url(#logo-bg)" opacity="0.2"/>
          </svg>
          <div>
            <div className="header-title">Alphabets</div>
          </div>
        </div>
        <div className="header-right">
          <nav className="header-nav">
            <button
              className={`nav-tab ${view === 'analyze' ? 'active' : ''}`}
              onClick={() => setView('analyze')}
            >
              Analyze
            </button>
            <button
              className={`nav-tab ${view === 'recommendations' ? 'active' : ''}`}
              onClick={() => setView('recommendations')}
            >
              Recommendations
            </button>
          </nav>
          <div className="header-status">
            <span className="status-dot"></span>
            <span>NSE/BSE</span>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Recommendations Page */}
      {view === 'recommendations' && (
        <div className="content-container">
          <Recommendations
            apiBase={API_BASE}
            onAnalyze={(t) => { setView('analyze'); analyzeStock(t); }}
          />
        </div>
      )}

      {view === 'analyze' && (<>
      {/* Hero Band */}
      {!analysisData && !dailyPickData && !loading && (
        <section className="hero-band">
          <div className="hero-content">
            <h1 className="hero-title">
              Stock <span className="accent">analysis</span>
            </h1>
            <p className="hero-subtitle">
              AI-curated picks backed by fundamentals, technicals, and sentiment.
            </p>
            <div className="hero-actions">
              <button onClick={fetchDailyPick} className="btn btn-primary btn-sm">
                Today's Pick
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Search Section */}
      <section id="search" className="search-section">
        <SearchBar onAnalyze={analyzeStock} apiBase={API_BASE} loading={loading} />
      </section>

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            {dailyPickData ? `Analyzing ${currentTicker}` : 'Scanning the market'}
          </div>
          <div className="loading-subtext">
            {dailyPickData 
              ? 'Fetching fundamentals, computing technicals, running AI analysis'
              : 'Scanning Nifty 50 stocks, analyzing fundamentals, technicals, news sentiment'}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Daily Pick */}
      {dailyPickData && !loading && !analysisData && (
        <div className="content-container">
          <DailyPick 
            data={dailyPickData} 
            onAnalyzeStock={analyzeDailyPickStock}
            className="fade-in"
          />
        </div>
      )}

      {/* Empty State */}
      {!loading && !analysisData && !dailyPickData && !error && (
        <div className="content-container">
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <div className="empty-title">Ready to analyze</div>
            <div className="empty-desc">
              Search for any NSE/BSE stock or get today's AI-curated investment pick.
            </div>
          </div>
        </div>
      )}

      {/* Analysis Dashboard */}
      {analysisData && !loading && (
        <div className="content-container">
          <div style={{ marginBottom: '24px' }}>
            <button 
              onClick={() => { setAnalysisData(null); setCurrentTicker(''); }} 
              className="btn btn-secondary btn-sm"
            >
              ← Back
            </button>
          </div>
          <div className="dashboard-grid fade-in">
            <div className="dashboard-top">
              <StockOverview
                quote={analysisData.quote}
                synthetic={analysisData.synthetic}
                className="stagger-1"
              />
              <AIRecommendation
                analysis={analysisData.aiAnalysis}
                quote={analysisData.quote}
                className="stagger-2"
              />
            </div>

            <div className="dashboard-middle">
              <TechnicalAnalysis
                technicals={analysisData.technicals}
                chartData={analysisData.chartData}
                chartIndicators={analysisData.chartIndicators}
                ticker={currentTicker}
                className="stagger-3"
              />
              <FundamentalAnalysis
                fundamentals={analysisData.fundamentals}
                className="stagger-4"
              />
            </div>

            <div className="dashboard-bottom">
              <NewsFeed
                news={analysisData.news}
                className="stagger-5"
              />
              <WatchlistScanner
                onSelectTicker={analyzeStock}
                apiBase={API_BASE}
              />
            </div>

            <div className="dashboard-full">
              <TimesFMForecast ticker={currentTicker} apiBase={API_BASE} />
            </div>
          </div>
        </div>
      )}
      </>)}

      {/* Disclaimer */}
      <div className="disclaimer">
        <strong>Disclaimer:</strong> Alphabets provides AI-generated analysis for educational and informational purposes only.
        This is not certified financial advice. All trading and investment decisions carry risk. Past performance does not guarantee future results.
        Always do your own research and consult a qualified financial advisor before making investment decisions.
      </div>
    </div>
  );
}

export default App;
