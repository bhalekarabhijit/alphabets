import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getQuote, getFundamentals, getHistoricalData, searchTickers, getYahooNews } from './services/yahooFinance.js';
import { computeIndicators } from './services/technicalAnalysis.js';
import { initOpenRouter, analyzeStock, deepDailyPickAnalysis } from './services/geminiAnalyzer.js';

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

app.get('/api/daily-pick', async (req, res) => {
  try {
    console.log('\n🧠 Starting Deep Daily Pick Analysis...');
    console.log(`   Scanning ${NIFTY_50.length} Nifty 50 stocks...`);

    const candidates = [];
    const batchSize = 5;

    for (let i = 0; i < NIFTY_50.length; i += batchSize) {
      const batch = NIFTY_50.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}...`);

      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
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

          return {
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
          };
        })
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          candidates.push(result.value);
        }
      });
    }

    console.log(`   ✅ Successfully gathered data for ${candidates.length} stocks`);
    console.log(`   🤖 Sending to Gemini for deep analysis...`);

    const aiDecision = await deepDailyPickAnalysis(candidates);

    console.log(`   ✅ Daily Pick: ${aiDecision.best_ticker}`);
    console.log(`   📊 Confidence: ${aiDecision.confidence}%\n`);

    res.json({
      success: true,
      data: {
        pick: aiDecision,
        candidates_analyzed: candidates.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Daily pick analysis failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: 'Try again in a few moments. The AI analysis requires significant computation.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Alphabets API Server running on http://localhost:${PORT}`);
  console.log(`   Market Focus: India (NSE/BSE)`);
  console.log(`   Daily Pick: Scans ${NIFTY_50.length} Nifty 50 stocks`);
  console.log(`\n   Try: http://localhost:${PORT}/api/analyze/RELIANCE.NS\n`);
});
