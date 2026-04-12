import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Gemini AI Intraday Stock Analyzer
 * Uses Gemini Flash for robust, fast logical deductions for day trading
 */

let genAI = null;
let model = null;

export function initGemini(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest', // Supported by the user's quota
    generationConfig: {
      temperature: 0.1, // Highly analytical
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });
}

export async function analyzeStock(ticker, data) {
  if (!model) {
    throw new Error('Gemini API not initialized. Set GEMINI_API_KEY in .env');
  }

  const { quote, fundamentals, intradayTechnicals, dailyTechnicals, news } = data;

  const prompt = buildIntradayPrompt(ticker, quote, fundamentals, intradayTechnicals, dailyTechnicals, news);

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      return JSON.parse(text);
    } catch (parseError) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error('Failed to parse Gemini response as JSON');
    }
  } catch (error) {
    console.error('Gemini analysis error:', error.message);
    throw error; // Fail visibly so user knows AI failed
  }
}

function buildIntradayPrompt(ticker, quote, fundamentals, intradayTechnicals, dailyTechnicals, news) {
  const newsContext = news && news.length > 0
    ? news.map(n => `- ${n.headline}`).join('\n')
    : 'No recent news available.';

  return `You are an elite Intraday Quantitative Trader focusing on the Indian stock market (NSE/BSE).
Your strict mandate: Analyze the data and suggest a single day-trade direction (BUY/SHORT) that must be closed before the 3:30 PM IST market close. 
We MUST not gamble. If the data is mixed or risk is high, recommend NO TRADE (HOLD).

ANALYZE THIS STOCK: ${ticker} (${quote?.name || ticker})
Current Price: ₹${quote?.price?.toFixed(2) || 'N/A'} (Note: Treat values in Indian Rupees (INR))

=== INTRADAY TECHNICALS (5-Minute chart over last 5 days) ===
- Current Price vs SMA 20: ${intradayTechnicals?.current?.price > intradayTechnicals?.current?.sma20 ? 'Above' : 'Below'} 
- RSI (14): ${intradayTechnicals?.current?.rsi?.toFixed(1)}
- MACD Histogram: ${intradayTechnicals?.current?.macd?.histogram?.toFixed(2)}
- Daily Volume vs Average: ${quote?.volume && quote?.avgVolume ? ((quote.volume / quote.avgVolume) * 100).toFixed(0) + '%' : 'N/A'}

=== DAILY TREND (Overall direction) ===
- Trend: ${dailyTechnicals?.signals?.summary?.overall || 'NEUTRAL'}

=== RECENT NEWS SUMMARY ===
${newsContext}

=== YOUR TASK ===
Based heavily on the short-term Intraday Technicals and momentum, formulate a DAY-TRADING plan to execute TODAY.
1. Determine if we should BUY, SHORT SELL, or HOLD (Skip).
2. Calculate a strict STOP LOSS (usually 1-2% from entry).
3. Calculate a realistic Target Price for today's close (usually a 1:2 risk-reward).
4. Explain your reasoning precisely (e.g., "VWAP breakout", "RSI oversold on 5m").

Respond with ONLY this exact JSON structure:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": <number 0-100>,
  "entry_price": <number>,
  "target_price": <number>,
  "stop_loss": <number>,
  "time_horizon": "Intraday (Close before 3:30 PM)",
  "risk_level": "LOW" | "MODERATE" | "HIGH",
  "scores": {
    "fundamental_score": <0-100>,
    "technical_score": <0-100>,
    "sentiment_score": <0-100>,
    "risk_score": <0-100>,
    "overall_score": <0-100>
  },
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "risks": ["<intraday risk 1>", "<intraday risk 2>"],
  "detailed_analysis": "<2 short paragraphs explaining intraday entry, why momentum supports it, and exit plan>",
  "math_analysis": {
    "pe_vs_sector": "N/A for intraday",
    "price_vs_intrinsic": "N/A for intraday",
    "risk_reward_ratio": "<calculated risk/reward based on target and stopless>",
    "support_resistance": "<immediate intraday support/resistance>"
  }
}`;
}

export async function researchBestPick(candidates) {
  if (!model) throw new Error('Gemini API not initialized');

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
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini research error:', error.message);
    throw error;
  }
}
