import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import StockOverview from './components/StockOverview';
import AIRecommendation from './components/AIRecommendation';
import FundamentalAnalysis from './components/FundamentalAnalysis';
import TechnicalAnalysis from './components/TechnicalAnalysis';
import NewsFeed from './components/NewsFeed';
import WatchlistScanner from './components/WatchlistScanner';
import DailyPick from './components/DailyPick';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://alphabets-ap.onrender.com/api';

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [dailyPickData, setDailyPickData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTicker, setCurrentTicker] = useState('');

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
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">α</div>
          <div>
            <div className="header-title">Alphabets</div>
            <div className="header-subtitle">AI-Powered Financial Intelligence</div>
          </div>
        </div>
        <div className="header-status">
          <span className="status-dot"></span>
          <span>NSE/BSE Markets</span>
        </div>
      </header>

      <SearchBar onAnalyze={analyzeStock} apiBase={API_BASE} loading={loading} />

      {!loading && !analysisData && !dailyPickData && !error && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button 
            onClick={fetchDailyPick} 
            className="watchlist-add-btn" 
            style={{ fontSize: '15px', padding: '12px 24px', borderRadius: '24px', backgroundColor: '#6366f1', color: 'white' }}
          >
            🔍 Find Today's Best Investment Pick
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            {dailyPickData ? `Analyzing ${currentTicker}...` : 'Researching the market...'}
          </div>
          <div className="loading-subtext">
            {dailyPickData 
              ? 'Fetching fundamentals, computing technical indicators, running AI analysis'
              : 'Scanning Nifty 50 stocks, analyzing fundamentals, technicals, news sentiment, and AI reasoning'}
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {dailyPickData && !loading && !analysisData && (
        <DailyPick 
          data={dailyPickData} 
          onAnalyzeStock={analyzeDailyPickStock}
          className="fade-in"
        />
      )}

      {!loading && !analysisData && !dailyPickData && !error && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Ready to Analyze</div>
          <div className="empty-desc">
            Search for a stock ticker or get today's AI-curated investment pick from the Nifty 50.
          </div>
        </div>
      )}

      {analysisData && !loading && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <button 
              onClick={() => { setAnalysisData(null); setCurrentTicker(''); }} 
              className="watchlist-add-btn"
              style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '20px' }}
            >
              ← Back to Daily Pick
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
          </div>
        </div>
      )}

      <div className="disclaimer">
        <strong>⚠️ Disclaimer:</strong> Alphabets provides AI-generated analysis for educational and informational purposes only.
        This is NOT certified financial advice. All trading and investment decisions carry risk. Past performance does not guarantee future results.
        Always do your own research and consult a qualified financial advisor before making investment decisions.
      </div>
    </div>
  );
}

export default App;
