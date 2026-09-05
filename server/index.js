import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getQuote, getQuotesBatch, getFundamentals, getHistoricalData, searchTickers, getYahooNews } from './services/yahooFinance.js';
import { computeIndicators } from './services/technicalAnalysis.js';
import { initOpenRouter, analyzeStock, deepDailyPickAnalysis } from './services/geminiAnalyzer.js';
import { cached, TTL } from './services/cache.js';
import { getForecast, getTimesfmPicks, getUniverseStatus, UNIVERSES } from './services/timesfmForecast.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here' && process.env.OPENROUTER_API_KEY !== 'sk-or-v1-your-openrouter-api-key-here') {
  initOpenRouter(process.env.OPENROUTER_API_KEY);
  console.log('✅ OpenRouter AI (Owl Alpha) initialized');
} else {
  console.warn('⚠️  OPENROUTER_API_KEY not set. AI analysis will fail until set.');
}

const NIFTY_50 = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS',
  'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS', 'SUNPHARMA.NS',
  'TITAN.NS', 'BAJFINANCE.NS', 'HCLTECH.NS', 'WIPRO.NS', 'ULTRACEMCO.NS',
  'TATASTEEL.NS', 'JSWSTEEL.NS', 'NTPC.NS', 'POWERGRID.NS', 'ONGC.NS',
  'M&M.NS', 'TATAMOTORS.NS', 'ADANIPORTS.NS', 'TECHM.NS', 'COALINDIA.NS',
  'ADANIENT.NS', 'BPCL.NS', 'DIVISLAB.NS', 'DRREDDY.NS', 'CIPLA.NS',
  'GRASIM.NS', 'HEROMOTOCO.NS', 'EICHERMOT.NS', 'BRITANNIA.NS', 'NESTLEIND.NS',
  'APOLLOHOSP.NS', 'SBILIFE.NS', 'BAJAJFINSV.NS', 'INDUSINDBK.NS', 'HDFCLIFE.NS',
  'TATACONSUM.NS', 'PIDILITIND.NS', 'DABUR.NS', 'SHREECEM.NS', 'UPL.NS',
];

app.get('/api/quote/:ticker', async (req, res) => {
  try {
    const quote = await getQuote(req.params.ticker);
    res.json({ success: true, data: quote, synthetic: quote._synthetic || false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const results = await searchTickers(req.query.q || '');
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/chart/:ticker', async (req, res) => {
  try {
    const period = req.query.period || '1d';
    const data = await getHistoricalData(req.params.ticker, period);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/fundamentals/:ticker', async (req, res) => {
  try {
    const data = await getFundamentals(req.params.ticker);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/technicals/:ticker', async (req, res) => {
  try {
    const historical = await getHistoricalData(req.params.ticker, '1d');
    const technicals = computeIndicators(historical);
    res.json({ success: true, data: technicals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/news/:ticker', async (req, res) => {
  try {
    const news = await getYahooNews(req.params.ticker);
    res.json({ success: true, data: news });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analyze/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    console.log(`\n🔍 Analyzing ${ticker} for Investment...`);

    const [quote, fundamentals, dailyChart, news] = await Promise.all([
      getQuote(ticker),
      getFundamentals(ticker),
      getHistoricalData(ticker, '1d'),
      getYahooNews(ticker),
    ]);

    console.log(`  ✅ Market & News Data fetched`);

    const dailyTechnicals = computeIndicators(dailyChart);
    console.log(`  ✅ Technical Indicators (Daily) complete`);

    const aiAnalysis = await analyzeStock(ticker, {
      quote,
      fundamentals,
      dailyTechnicals,
      news,
    });
    console.log(`  ✅ AI Investment Analysis complete`);

    const isSynthetic = !!(quote._synthetic || fundamentals._synthetic);
    console.log(`  📊 Synthetic data: ${isSynthetic}`);

    res.json({
      success: true,
      data: {
        quote,
        fundamentals,
        technicals: {
          current: dailyTechnicals.current,
          signals: dailyTechnicals.signals,
        },
        chartData: dailyChart,
        chartIndicators: dailyTechnicals.series,
        news,
        aiAnalysis,
      },
      synthetic: isSynthetic,
    });
  } catch (error) {
    console.error(`❌ Analysis failed for ${req.params.ticker}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/watchlist/scan', async (req, res) => {
  try {
    const { tickers: rawTickers } = req.body;
    if (!rawTickers || !Array.isArray(rawTickers) || rawTickers.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide an array of tickers' });
    }

    const tickers = rawTickers.slice(0, 10).map(t => t.toUpperCase());
    // One batched request for all prices instead of one per ticker.
    const quotes = await getQuotesBatch(tickers);
    const quoteBySymbol = new Map(quotes.map(q => [q.symbol.toUpperCase(), q]));

    const results = [];
    for (const ticker of tickers) {
      try {
        const quote = quoteBySymbol.get(ticker) || await getQuote(ticker);
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

app.get('/api/daily-pick', async (req, res) => {
  try {
    const data = await cached('daily-pick', TTL.DAILY_PICK, computeDailyPick);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Daily pick analysis failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: 'Try again in a few moments. The AI analysis requires significant computation.',
    });
  }
});

// Cheap daily pick: 1 batched quote request screens all 50 stocks,
// full 4-call analysis runs only on the top 10. ~11 Yahoo requests
// total instead of ~200. Result cached 12h (it's a *daily* pick).
async function computeDailyPick() {
  console.log('\n🧠 Starting Deep Daily Pick Analysis...');
  console.log(`   Screening ${NIFTY_50.length} Nifty 50 stocks (1 batched request)...`);

  const allQuotes = await getQuotesBatch(NIFTY_50);
  const realQuotes = allQuotes.filter(q => q && q.source !== 'synthetic' && q.price > 0);

  // Screen: momentum + volume activity + distance from 52w low (value).
  const screened = (realQuotes.length ? realQuotes : allQuotes)
    .map(q => {
      const range = (q.fiftyTwoWeekHigh || 0) - (q.fiftyTwoWeekLow || 0);
      const offLow = range > 0 ? ((q.price - q.fiftyTwoWeekLow) / range) * 100 : 50;
      const volRatio = q.avgVolume > 0 ? q.volume / q.avgVolume : 1;
      const score = (q.changePercent || 0) * 2 + Math.min(volRatio, 3) * 5 + (100 - offLow) * 0.1;
      return { q, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(s => s.q.symbol);

  console.log(`   ✅ Screened to ${screened.length} candidates, running full analysis...`);

  const candidates = [];
  for (const ticker of screened) {
    try {
      const [quote, fundamentals, dailyChart, news] = await Promise.all([
        getQuote(ticker),
        getFundamentals(ticker),
        getHistoricalData(ticker, '1d'),
        getYahooNews(ticker),
      ]);

      const technicals = computeIndicators(dailyChart);
      const volumeRatio = quote.avgVolume > 0 ? (quote.volume / quote.avgVolume) * 100 : 100;
      let marketCapFormatted = 'N/A';
      if (quote.marketCap) {
        if (quote.marketCap >= 1e12) marketCapFormatted = (quote.marketCap / 1e12).toFixed(2) + 'T';
        else if (quote.marketCap >= 1e9) marketCapFormatted = (quote.marketCap / 1e9).toFixed(2) + 'B';
        else marketCapFormatted = (quote.marketCap / 1e6).toFixed(2) + 'M';
      }

      candidates.push({
        ticker,
        name: quote.name,
        price: quote.price,
        changePercent: quote.changePercent,
        volumeRatio,
        marketCap: quote.marketCap,
        marketCapFormatted,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fundamentals,
        technicals,
        news: news || [],
      });
    } catch (e) {
      console.warn(`   ⚠️ Skipping ${ticker}: ${e.message}`);
    }
  }

  console.log(`   ✅ Full data for ${candidates.length} candidates`);
  console.log(`   🤖 Sending to AI for deep analysis...`);

  const aiDecision = await deepDailyPickAnalysis(candidates);

  console.log(`   ✅ Daily Pick: ${aiDecision.best_ticker}`);
  console.log(`   📊 Confidence: ${aiDecision.confidence}%\n`);

  return {
    pick: aiDecision,
    candidates_analyzed: candidates.length,
    screened_from: NIFTY_50.length,
    timestamp: new Date().toISOString(),
  };
}

// ---------- TimesFM forecasts (nightly batch, see /forecast/README.md) ----------
app.get('/api/universes', (req, res) => {
  res.json({ success: true, data: getUniverseStatus() });
});

app.get('/api/forecast/:ticker', (req, res) => {
  const universe = req.query.universe || 'nifty50';
  const fc = getForecast(req.params.ticker, universe);
  if (!fc) {
    return res.json({
      success: false,
      error: `No TimesFM forecast for this ticker in ${universe} yet. Forecasts refresh nightly; use the Refresh button on the Recommendations page to generate them on demand.`,
    });
  }
  res.json({ success: true, data: fc });
});

app.get('/api/timesfm-picks', (req, res) => {
  const universe = req.query.universe || 'nifty50';
  const picks = getTimesfmPicks(universe);
  if (!picks) {
    return res.json({
      success: false,
      error: `TimesFM picks for ${universe} not generated yet. Hit Refresh on the Recommendations page (or wait for the nightly run).`,
    });
  }
  res.json({ success: true, data: picks });
});

// Trigger the TimesFM workflow on demand via the GitHub API.
// Needs GH_PAT env (fine-grained PAT with Actions: read+write on this repo).
// Free limits reminder: public repo = unlimited Actions minutes; each run
// takes ~5-12 min. Don't spam it — forecasts only change after market close.
const GH_REPO = process.env.GH_REPO || 'bhalekarabhijit/alphabets';
const GH_WORKFLOW = 'timesfm-nightly.yml';

app.post('/api/forecast/refresh', async (req, res) => {
  const universe = req.body?.universe || 'nifty50';
  if (!UNIVERSES.some(u => u.id === universe)) {
    return res.status(400).json({ success: false, error: `Unknown universe: ${universe}` });
  }
  if (!process.env.GH_PAT) {
    return res.status(503).json({
      success: false,
      error: 'Workflow trigger not configured. Set GH_PAT (GitHub PAT with Actions write) on the server to enable one-click refresh.',
    });
  }
  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GH_PAT}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs: { universe } }),
      }
    );
    if (ghRes.status === 204) {
      return res.json({
        success: true,
        message: `Forecast run started for ${universe}. Fresh picks land in ~10 min (watch the Actions tab or wait for auto-refresh).`,
        actionsUrl: `https://github.com/${GH_REPO}/actions/workflows/${GH_WORKFLOW}`,
      });
    }
    const errText = await ghRes.text();
    console.error('GitHub dispatch failed:', ghRes.status, errText.slice(0, 200));
    return res.status(502).json({ success: false, error: `GitHub rejected the trigger (HTTP ${ghRes.status}). Check GH_PAT scopes.` });
  } catch (e) {
    return res.status(502).json({ success: false, error: `Could not reach GitHub: ${e.message}` });
  }
});

app.listen(PORT, () => {  console.log(`\n🚀 Alphabets API Server running on http://localhost:${PORT}`);
  console.log(`   Market Focus: India (NSE/BSE)`);
  console.log(`   Daily Pick: Scans ${NIFTY_50.length} Nifty 50 stocks`);
  console.log(`\n   Try: http://localhost:${PORT}/api/analyze/RELIANCE.NS\n`);
});
