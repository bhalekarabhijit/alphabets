import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import StockOverview from './components/StockOverview';
import AIRecommendation from './components/AIRecommendation';
import FundamentalAnalysis from './components/FundamentalAnalysis';
import TechnicalAnalysis from './components/TechnicalAnalysis';
import NewsFeed from './components/NewsFeed';
import WatchlistScanner from './components/WatchlistScanner';
import './App.css';

const API_BASE = 'http://localhost:3001/api';

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTicker, setCurrentTicker] = useState('');

  const analyzeStock = useCallback(async (ticker) => {
    setLoading(true);
    setError(null);
    setCurrentTicker(ticker);

    try {
      const response = await fetch(`${API_BASE}/analyze/${ticker}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      setAnalysisData(result.data);
    } catch (err) {
      setError(err.message);
      setAnalysisData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeDailyPick = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCurrentTicker('Today\'s Pick');
    
    try {
      const response = await fetch(`${API_BASE}/daily-pick`);
      const result = await response.json();
      
      if (!result.success || !result.data.ticker) {
        throw new Error('Failed to fetch daily pick');
      }
      
      await analyzeStock(result.data.ticker);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [analyzeStock]);

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
          <span>Markets Active</span>
        </div>
      </header>

      <SearchBar onAnalyze={analyzeStock} apiBase={API_BASE} loading={loading} />

      {!loading && !analysisData && !error && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button 
            onClick={analyzeDailyPick} 
            className="watchlist-add-btn" 
            style={{ fontSize: '15px', padding: '10px 20px', borderRadius: '24px', backgroundColor: '#6366f1', color: 'white' }}
          >
            🔥 Suggest Today's Best Day-Trade
          </button>
        </div>
      )}

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">Analyzing {currentTicker}...</div>
          <div className="loading-subtext">
            Fetching fundamentals, computing technical indicators, running AI analysis
          </div>
        </div>
      )}

      {!loading && !analysisData && !error && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Ready to Analyze</div>
          <div className="empty-desc">
            Enter a stock ticker above to get a comprehensive AI-powered analysis
            with fundamental metrics, technical indicators, and actionable recommendations.
          </div>
        </div>
      )}

      {analysisData && !loading && (
        <div className="dashboard-grid fade-in">
          <div className="dashboard-top">
            <StockOverview
              quote={analysisData.quote}
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
