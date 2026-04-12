import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getQuote, getFundamentals, getHistoricalData, searchTickers, getYahooNews } from './services/yahooFinance.js';
import { computeIndicators } from './services/technicalAnalysis.js';
import { initGemini, analyzeStock } from './services/geminiAnalyzer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Gemini
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
  initGemini(process.env.GEMINI_API_KEY);
  console.log('✅ Gemini Flash AI initialized');
} else {
  console.warn('⚠️  GEMINI_API_KEY not set. AI analysis will fail until set.');
}

// === ROUTES ===

// Quick quote
app.get('/api/quote/:ticker', async (req, res) => {
  try {
    const quote = await getQuote(req.params.ticker);
    res.json({ success: true, data: quote });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search tickers (biased to India)
app.get('/api/search', async (req, res) => {
  try {
    const results = await searchTickers(req.query.q || '');
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historical chart data (1y daily)
app.get('/api/chart/:ticker', async (req, res) => {
  try {
    const period = req.query.period || '1d';
    const data = await getHistoricalData(req.params.ticker, period);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fundamentals
app.get('/api/fundamentals/:ticker', async (req, res) => {
  try {
    const data = await getFundamentals(req.params.ticker);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Technical analysis (daily)
app.get('/api/technicals/:ticker', async (req, res) => {
  try {
    const historical = await getHistoricalData(req.params.ticker, '1d');
    const technicals = computeIndicators(historical);
    res.json({ success: true, data: technicals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// News (Free Yahoo Finance News)
app.get('/api/news/:ticker', async (req, res) => {
  try {
    const news = await getYahooNews(req.params.ticker);
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Full AI Intraday Analysis
app.get('/api/analyze/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    console.log(`\n🔍 Analyzing ${ticker} for Intraday Trading...`);

    // Fetch all data in parallel (Intraday + Daily + News)
    const [quote, fundamentals, dailyChart, intradayChart, news] = await Promise.all([
      getQuote(ticker),
      getFundamentals(ticker),
      getHistoricalData(ticker, '1d'),
      getHistoricalData(ticker, 'intraday'),
      getYahooNews(ticker),
    ]);

    console.log(`  ✅ Market & News Data fetched`);

    // Compute technical indicators
    const dailyTechnicals = computeIndicators(dailyChart);
    const intradayTechnicals = computeIndicators(intradayChart);
    console.log(`  ✅ Technical Indicators (Daily + Intraday) complete`);

    // AI analysis using Intraday focus
    const aiAnalysis = await analyzeStock(ticker, {
      quote,
      fundamentals,
      intradayTechnicals,
      dailyTechnicals,
      news,
    });
    console.log(`  ✅ AI Intraday Analysis complete`);

    res.json({
      success: true,
      data: {
        quote,
        fundamentals,
        technicals: {
          current: dailyTechnicals.current, // Use daily for dashboard view
          signals: dailyTechnicals.signals,
        },
        chartData: dailyChart,       // Passing daily chart to UI for broad view
        intradayChartData: intradayChart, // Intraday chart specifically for VWAP view if needed
        chartIndicators: dailyTechnicals.series,
        news,
        aiAnalysis,
      },
    });
  } catch (error) {
    console.error(`❌ Analysis failed for ${req.params.ticker}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Watchlist scan
app.post('/api/watchlist/scan', async (req, res) => {
  try {
    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide an array of tickers' });
    }

    const results = [];
    for (const ticker of tickers.slice(0, 10)) {
      try {
        const quote = await getQuote(ticker);
        const intradayChart = await getHistoricalData(ticker, 'intraday');
        const technicals = computeIndicators(intradayChart);

        results.push({
          ticker: ticker.toUpperCase(),
          name: quote.name,
          price: quote.price,
          change: quote.changePercent,
          signal: technicals.signals.summary.overall,
          buySignals: technicals.signals.summary.buy,
          sellSignals: technicals.signals.summary.sell,
          rsi: technicals.current.rsi,
        });
      } catch (e) {
        results.push({
          ticker: ticker.toUpperCase(),
          error: e.message,
        });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Daily Top Pick
app.get('/api/daily-pick', async (req, res) => {
  try {
    const tickers = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];
    const results = [];
    
    for (const ticker of tickers) {
      try {
        const intradayChart = await getHistoricalData(ticker, 'intraday');
        const technicals = computeIndicators(intradayChart);
        results.push({
          ticker: ticker.toUpperCase(),
          buySignals: technicals.signals.summary.buy || 0,
          rsi: technicals.current.rsi || 50
        });
      } catch (e) {
        // Skip on error
      }
    }
    
    // Logic: find stock with highest buy signals, break tie with lowest RSI (oversold)
    results.sort((a, b) => {
      if (b.buySignals !== a.buySignals) return b.buySignals - a.buySignals;
      return a.rsi - b.rsi;
    });

    const bestPick = results.length > 0 ? results[0].ticker : 'RELIANCE.NS';
    res.json({ success: true, data: { ticker: bestPick } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Alphabets API Server running on http://localhost:${PORT}`);
  console.log(`   Market Focus: India (BSE/NSE) + Intraday`);
  console.log(`\n   Try: http://localhost:${PORT}/api/analyze/RELIANCE.NS\n`);
});
