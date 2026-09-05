import OpenAI from 'openai';

let client = null;

export function initOpenRouter(apiKey) {
  client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

// Free-model chain: OpenRouter delists :free models without warning
// (owl-alpha, deepseek-v4-flash, qwen3-coder all died this way), so we try
// each in order instead of hardcoding one. Override with OPENROUTER_MODELS
// env var (comma-separated). Verified live 2026-09-05: all $0 + JSON mode.
const DEFAULT_MODELS = [
  'minimax/minimax-m3:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openrouter/free', // auto-router across free models, last resort
];

function getModelChain() {
  const env = (process.env.OPENROUTER_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_MODELS;
}

function isModelGone(error) {
  const msg = (error.message || '').toLowerCase();
  return error.status === 404 || msg.includes('404') || msg.includes('no endpoints');
}

async function tryModel(model, prompt, maxTokens, useJsonMode) {
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a JSON-only API. Respond with valid JSON only. No markdown, no explanation, no code blocks.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await client.chat.completions.create(body);
  const text = response.choices[0].message.content;

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse AI response as JSON');
  }
}

async function callModel(prompt, maxTokens = 4096) {
  if (!client) {
    throw new Error('OpenRouter API not initialized. Set OPENROUTER_API_KEY in .env');
  }

  const models = getModelChain();
  let lastError = null;

  for (const model of models) {
    // Attempt 1: JSON mode. Attempt 2 (on 429): same model after backoff.
    // Attempt 3: same model without JSON mode (some free models reject it).
    for (let attempt = 1; attempt <= 3; attempt++) {
      const useJsonMode = attempt < 3;
      try {
        const parsed = await tryModel(model, prompt, maxTokens, useJsonMode);
        if (model !== models[0]) console.log(`  ↪ AI response via fallback model ${model}`);
        return parsed;
      } catch (error) {
        lastError = error;
        if (isModelGone(error)) {
          console.warn(`⚠️  Model ${model} unavailable (${error.message?.slice(0, 80)}). Trying next...`);
          break; // next model, don't waste retries on a dead endpoint
        }
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
          if (attempt < 2) {
            const waitMs = 5000;
            console.warn(`⏳ OpenRouter rate limited on ${model}. Waiting ${waitMs}ms...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn(`⏳ ${model} still rate-limited. Trying next model...`);
          break;
        }
        if (error.status === 400 && useJsonMode) continue; // retry without JSON mode
        throw error; // auth errors etc: fail fast, don't mask them
      }
    }
  }

  throw lastError || new Error('All AI models unavailable');
}

export async function analyzeStock(ticker, data) {
  const { quote, fundamentals, dailyTechnicals, news } = data;
  const prompt = buildInvestmentPrompt(ticker, quote, fundamentals, dailyTechnicals, news);

  try {
    return await callModel(prompt);
  } catch (error) {
    console.error('AI analysis error:', error.message);
    throw error;
  }
}

function buildInvestmentPrompt(ticker, quote, fundamentals, dailyTechnicals, news) {
  const newsContext = news && news.length > 0
    ? news.map(n => `- ${n.headline}`).join('\n')
    : 'No recent news available.';

  const currentPrice = quote?.price || 0;
  const fiftyTwoWeekHigh = quote?.fiftyTwoWeekHigh || currentPrice * 1.3;
  const fiftyTwoWeekLow = quote?.fiftyTwoWeekLow || currentPrice * 0.7;
  const pe = fundamentals?.trailingPE;
  const roe = fundamentals?.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(1) : 'N/A';
  const profitMargin = fundamentals?.profitMargin ? (fundamentals.profitMargin * 100).toFixed(1) : 'N/A';
  const revenueGrowth = fundamentals?.revenueGrowth ? (fundamentals.revenueGrowth * 100).toFixed(1) : 'N/A';
  const debtToEquity = fundamentals?.debtToEquity?.toFixed(2) || 'N/A';
  const analystTarget = fundamentals?.targetMeanPrice;
  const recommendationKey = fundamentals?.recommendationKey;
  const priceToBook = fundamentals?.priceToBook?.toFixed(2) || 'N/A';
  const operatingMargin = fundamentals?.operatingMargin ? (fundamentals.operatingMargin * 100).toFixed(1) : 'N/A';
  const currentRatio = fundamentals?.currentRatio?.toFixed(2) || 'N/A';
  const earningsGrowth = fundamentals?.earningsGrowth ? (fundamentals.earningsGrowth * 100).toFixed(1) : 'N/A';

  const rsi = dailyTechnicals?.current?.rsi?.toFixed(1) || 'N/A';
  const macdHistogram = dailyTechnicals?.current?.macd?.histogram?.toFixed(2) || 'N/A';
  const sma20 = dailyTechnicals?.current?.sma20?.toFixed(2) || 'N/A';
  const sma50 = dailyTechnicals?.current?.sma50?.toFixed(2) || 'N/A';
  const sma200 = dailyTechnicals?.current?.sma200?.toFixed(2) || 'N/A';
  const atr = dailyTechnicals?.current?.atr?.toFixed(2) || 'N/A';
  const trendSignal = dailyTechnicals?.signals?.summary?.overall || 'NEUTRAL';
  const buySignals = dailyTechnicals?.signals?.summary?.buy || 0;
  const sellSignals = dailyTechnicals?.signals?.summary?.sell || 0;
  const priceVsSma50 = dailyTechnicals?.current?.sma50 ? (currentPrice > dailyTechnicals.current.sma50 ? 'Above (Bullish)' : 'Below (Bearish)') : 'N/A';
  const priceVsSma200 = dailyTechnicals?.current?.sma200 ? (currentPrice > dailyTechnicals.current.sma200 ? 'Above (Bullish)' : 'Below (Bearish)') : 'N/A';
  const volumeRatio = quote?.volume && quote?.avgVolume ? ((quote.volume / quote.avgVolume) * 100).toFixed(0) : 'N/A';

  return `You are a veteran Indian stock market analyst and quantitative researcher with 20+ years of experience. You analyze stocks the way top institutional investors do - combining fundamental analysis, technical analysis, news sentiment, and quantitative metrics.

YOUR TASK: Analyze ${ticker} and provide a comprehensive investment recommendation for a short-to-medium term holding period (1-4 weeks). This is NOT intraday trading - this is a proper investment decision that a professional investor would make.

ANALYZE THIS STOCK: ${ticker} (${quote?.name || ticker})
Current Price: ₹${currentPrice?.toFixed(2) || 'N/A'} (Indian Rupees - INR)

=== FUNDAMENTAL HEALTH ===
- P/E Ratio: ${pe || 'N/A'}
- Price to Book: ${priceToBook}
- ROE: ${roe}%
- Profit Margin: ${profitMargin}%
- Operating Margin: ${operatingMargin}%
- Revenue Growth (YoY): ${revenueGrowth}%
- Earnings Growth (YoY): ${earningsGrowth}%
- Debt to Equity: ${debtToEquity}
- Current Ratio: ${currentRatio}
- Analyst Target Price: ₹${analystTarget?.toFixed(2) || 'N/A'}
- Analyst Consensus: ${recommendationKey || 'N/A'}

=== TECHNICAL SETUP (Daily Chart) ===
- RSI (14): ${rsi}
- MACD Histogram: ${macdHistogram}
- SMA 20: ₹${sma20}
- SMA 50: ₹${sma50} (Price: ${priceVsSma50})
- SMA 200: ₹${sma200} (Price: ${priceVsSma200})
- ATR (14): ₹${atr}
- Overall Trend Signal: ${trendSignal} (Buy: ${buySignals}, Sell: ${sellSignals})
- Volume vs Avg: ${volumeRatio}%

=== 52-WEEK RANGE ===
- Low: ₹${fiftyTwoWeekLow?.toFixed(2)} | High: ₹${fiftyTwoWeekHigh?.toFixed(2)}
- Current Position: ${currentPrice && fiftyTwoWeekHigh && fiftyTwoWeekLow ? (((currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100).toFixed(0) + '%' : 'N/A'} from low

=== RECENT NEWS ===
${newsContext}

=== YOUR ANALYSIS FRAMEWORK ===

1. FUNDAMENTAL HEALTH (25% weight)
   - Is P/E reasonable vs growth rate? (PEG < 1.5 is good)
   - Is ROE strong (>15%)? Are margins healthy and improving?
   - Is debt manageable (D/E < 100)?
   - Is revenue/earnings growing consistently?

2. TECHNICAL SETUP (25% weight)
   - Is price above key moving averages (SMA 50, SMA 200)?
   - Is RSI in a good zone (not overbought >70, not oversold <30)?
   - Are there bullish technical signals (MACD crossover, golden cross)?
   - Is volume supporting the move?

3. NEWS SENTIMENT (20% weight)
   - Are recent news headlines positive or negative?
   - Any catalysts (earnings beats, new contracts, policy changes)?
   - Any red flags (regulatory issues, management changes)?

4. RISK-REWARD (15% weight)
   - How far is current price from analyst target?
   - What's the 52-week range position?
   - Is ATR reasonable for the risk?

5. MARKET CONTEXT (15% weight)
   - Is the stock in a sector that's currently favored?
   - Is the broader market trend supportive?

=== OUTPUT REQUIREMENTS ===

Respond with ONLY this exact JSON structure. CRITICAL RULES:
- entry_price, target_price, and stop_loss MUST be realistic non-zero numbers based on the current price
- Even if recommending HOLD, calculate what the entry, target, and stop-loss WOULD be if you were to invest
- target_price should be 5-15% above entry for a BUY, or 5-15% below for a SELL
- stop_loss should be 3-8% away from entry depending on volatility (use ATR)
- NEVER return 0 for any price field
- NEVER return the same value for entry, target, and stop_loss

{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": <number 0-100>,
  "entry_price": <number - realistic entry based on current price and technicals>,
  "target_price": <number - realistic target, NOT 0, NOT same as entry>,
  "stop_loss": <number - realistic stop loss, NOT 0, NOT same as entry>,
  "time_horizon": "<e.g., 1-4 weeks, 1-3 months>",
  "risk_level": "LOW" | "MODERATE" | "HIGH",
  "scores": {
    "fundamental_score": <0-100>,
    "technical_score": <0-100>,
    "sentiment_score": <0-100>,
    "risk_score": <0-100, higher is safer>,
    "overall_score": <0-100>
  },
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "detailed_analysis": "<2-3 paragraphs explaining the full investment thesis combining fundamentals, technicals, and news>",
  "math_analysis": {
    "pe_vs_sector": "<analysis of whether P/E is cheap/expensive vs typical sector P/E>",
    "price_vs_intrinsic": "<estimate if stock is undervalued/fairly valued/overvalued based on fundamentals>",
    "risk_reward_ratio": "<calculated as (target - entry) / (entry - stop_loss), e.g., 2.5:1>",
    "support_resistance": "<key support and resistance levels based on SMAs and 52-week range>"
  }
}`;
}

export async function researchBestPick(candidates) {
  const candidatesText = candidates.map(c => 
    `TICKER: ${c.ticker}
    - Buy Signals: ${c.buySignals}
    - RSI: ${c.rsi}
    - Recent News: ${c.news.slice(0,2).map(n => n.headline).join(' | ')}`
  ).join('\n\n');

  const prompt = `You are a highly analytical Indian Stock Market Quant.
Your task is to review the following candidates and strictly select the SINGLE BEST stock to intraday Day-Trade today based on mathematical momentum and recent news catalysts.

CANDIDATES:
${candidatesText}

Respond with ONLY this exact JSON format:
{
  "best_ticker": "<Winning Ticker exactly as provided (e.g. RELIANCE.NS)>",
  "reasoning_summary": "<One sentence explaining why news & math align perfectly>"
}`;

  try {
    return await callModel(prompt, 1024);
  } catch (error) {
    console.error('AI research error:', error.message);
    throw error;
  }
}

export async function deepDailyPickAnalysis(candidates) {
  const candidatesText = candidates.map((c, idx) => {
    const newsSummary = c.news && c.news.length > 0
      ? c.news.slice(0, 3).map(n => `  - ${n.headline} (${n.source})`).join('\n')
      : '  No recent news.';

    return `=== CANDIDATE ${idx + 1}: ${c.ticker} (${c.name}) ===
CURRENT PRICE: ₹${c.price?.toFixed(2) || 'N/A'}
CHANGE TODAY: ${c.changePercent?.toFixed(2) || 'N/A'}%
MARKET CAP: ₹${c.marketCapFormatted || 'N/A'}

FUNDAMENTAL METRICS:
- P/E Ratio: ${c.fundamentals?.trailingPE?.toFixed(2) || 'N/A'}
- Forward P/E: ${c.fundamentals?.forwardPE?.toFixed(2) || 'N/A'}
- P/B Ratio: ${c.fundamentals?.priceToBook?.toFixed(2) || 'N/A'}
- ROE: ${c.fundamentals?.returnOnEquity ? (c.fundamentals.returnOnEquity * 100).toFixed(1) + '%' : 'N/A'}
- Revenue Growth: ${c.fundamentals?.revenueGrowth ? (c.fundamentals.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
- Profit Margin: ${c.fundamentals?.profitMargin ? (c.fundamentals.profitMargin * 100).toFixed(1) + '%' : 'N/A'}
- Debt/Equity: ${c.fundamentals?.debtToEquity?.toFixed(2) || 'N/A'}
- Current Ratio: ${c.fundamentals?.currentRatio?.toFixed(2) || 'N/A'}
- Analyst Target: ₹${c.fundamentals?.targetMeanPrice?.toFixed(2) || 'N/A'}
- Analyst Rating: ${c.fundamentals?.recommendationKey || 'N/A'}

TECHNICAL INDICATORS (Daily):
- RSI (14): ${c.technicals?.current?.rsi?.toFixed(1) || 'N/A'}
- MACD Histogram: ${c.technicals?.current?.macd?.histogram?.toFixed(2) || 'N/A'}
- SMA 20: ₹${c.technicals?.current?.sma20?.toFixed(2) || 'N/A'}
- SMA 50: ₹${c.technicals?.current?.sma50?.toFixed(2) || 'N/A'}
- SMA 200: ₹${c.technicals?.current?.sma200?.toFixed(2) || 'N/A'}
- Price vs SMA50: ${c.technicals?.current?.price > c.technicals?.current?.sma50 ? 'Above (Bullish)' : 'Below (Bearish)'}
- Price vs SMA200: ${c.technicals?.current?.sma200 ? (c.technicals?.current?.price > c.technicals?.current?.sma200 ? 'Above (Long-term Bullish)' : 'Below (Long-term Bearish)') : 'N/A'}
- ATR (14): ₹${c.technicals?.current?.atr?.toFixed(2) || 'N/A'}
- Signal Summary: ${c.technicals?.signals?.summary?.overall || 'N/A'} (Buy: ${c.technicals?.signals?.summary?.buy || 0}, Sell: ${c.technicals?.signals?.summary?.sell || 0})

RECENT NEWS:
${newsSummary}

52-WEEK RANGE: ₹${c.fiftyTwoWeekLow?.toFixed(2) || 'N/A'} - ₹${c.fiftyTwoWeekHigh?.toFixed(2) || 'N/A'}
VOLUME vs AVG: ${c.volumeRatio?.toFixed(0) || 'N/A'}%
`;
  }).join('\n');

  const prompt = `You are a veteran Indian stock market analyst and portfolio manager with 20+ years of experience. You analyze stocks the way top institutional investors do - combining fundamental analysis, technical analysis, news sentiment, and quantitative metrics.

YOUR TASK: Review ALL candidates below and select the SINGLE BEST stock for investment/swing trading over the next 1-4 weeks. This is NOT intraday - this is a short-to-medium term investment recommendation.

ANALYSIS FRAMEWORK (apply to each candidate):

1. FUNDAMENTAL HEALTH (25% weight)
   - Is P/E reasonable vs growth rate? (PEG < 1.5 is good)
   - Is ROE strong (>15%)? Are margins healthy?
   - Is debt manageable (D/E < 100)?
   - Is revenue/earnings growing?

2. TECHNICAL SETUP (25% weight)
   - Is price above key moving averages (SMA 50, SMA 200)?
   - Is RSI in a good zone (not overbought >70, not oversold <30)?
   - Are there bullish technical signals?
   - Is volume supporting the move?

3. NEWS SENTIMENT (20% weight)
   - Are recent news headlines positive or negative?
   - Any catalysts (earnings beats, new contracts, policy changes)?
   - Any red flags (regulatory issues, management changes)?

4. RISK-REWARD (15% weight)
   - How far is current price from analyst target?
   - What's the 52-week range position?
   - Is ATR reasonable for the risk?

5. MARKET CONTEXT (15% weight)
   - Is the stock in a sector that's currently favored?
   - Is the broader market trend supportive?

CANDIDATES TO ANALYZE:

${candidatesText}

RESPOND WITH ONLY THIS EXACT JSON STRUCTURE:

{
  "best_ticker": "<Exact ticker symbol of the best pick>",
  "name": "<Company name>",
  "confidence": <number 0-100, how confident you are in this pick>,
  "investment_type": "SWING" | "POSITION" | "LONG_TERM",
  "time_horizon": "<e.g., 1-4 weeks, 1-3 months>",
  "entry_price": <recommended entry price>,
  "target_price": <realistic target price>,
  "stop_loss": <stop loss level>,
  "risk_level": "LOW" | "MODERATE" | "HIGH",
  "risk_reward_ratio": <calculated ratio>,
  "scores": {
    "fundamental_score": <0-100>,
    "technical_score": <0-100>,
    "sentiment_score": <0-100>,
    "risk_score": <0-100, higher is safer>,
    "overall_score": <0-100>
  },
  "why_this_stock": "<2-3 sentence summary of why this is the best pick among all candidates>",
  "fundamental_thesis": "<Detailed fundamental analysis - valuation, growth, profitability, financial health>",
  "technical_thesis": "<Technical analysis - trend, momentum, support/resistance, indicators>",
  "news_catalyst": "<How recent news supports this investment>",
  "key_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "what_to_watch": ["<specific event/metric to monitor>", "<another thing to watch>"],
  "position_sizing": "<Recommended allocation as % of portfolio, e.g., 5-10%>",
  "exit_strategy": "<When to take profits, when to cut losses>"
}

BE STRICT. If no stock meets quality criteria, still pick the best one but lower the confidence and clearly state the risks. Always prioritize capital preservation over aggressive gains.`;

  try {
    return await callModel(prompt, 8192);
  } catch (error) {
    console.error('AI deep analysis error:', error.message);
    throw error;
  }
}
