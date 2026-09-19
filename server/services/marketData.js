// Unified market-data layer — the ONLY way routes fetch market data.
//
// Every consumer (analyze, watchlist, daily-pick, straddle, portfolio, ask)
// goes through here and gets one stamped bundle:
//   { ticker, asOf, quote, fundamentals, history, technicals, news, timesfm,
//     sources: { quote, fundamentals, history, news, timesfm },
//     synthetic: <true if ANY leg is synthetic> }
//
// Rules:
// - Bulk quote path (getQuotesBatch) is preferred for screening lists.
// - Callers never touch yahooFinance/fallbacks directly anymore.

import {
  getQuote, getQuotesBatch, getFundamentals, getHistoricalData,
  getYahooNews, getLastSource,
} from './yahooFinance.js';
import { computeIndicators } from './technicalAnalysis.js';
import { getForecast } from './timesfmForecast.js';

export { getQuotesBatch };

function isSyntheticSource(s) {
  return s === 'synthetic';
}

/**
 * Full bundle for one ticker: everything /api/analyze needs.
 * Response-shaping stays in index.js; this returns raw material + stamps.
 */
export async function getMarketSnapshot(ticker, period = '1d') {
  const [quote, fundamentals, history, news, timesfm] = await Promise.all([
    getQuote(ticker),
    getFundamentals(ticker),
    getHistoricalData(ticker, period),
    getYahooNews(ticker),
    getForecast(ticker).catch(() => null),
  ]);

  const canon = quote.symbol || ticker.toUpperCase();
  const sources = {
    quote: quote.source || 'unknown',
    fundamentals: fundamentals.source || 'unknown',
    history: getLastSource(`hist:${canon}:${period}`),
    news: getLastSource(`news:${canon}`),
    timesfm: timesfm ? 'timesfm' : 'none',
  };

  const technicals = computeIndicators(history);

  return {
    ticker: canon,
    asOf: new Date().toISOString(),
    quote,
    fundamentals,
    history,
    technicals,
    news,
    timesfm,
    sources,
    synthetic: [sources.quote, sources.fundamentals, sources.history]
      .some(isSyntheticSource),
  };
}

/**
 * Lighter bundle for screening lists (watchlist, daily-pick candidates).
 * News is included but callers may skip it for speed via opts.news=false.
 */
export async function getScreeningBundle(ticker, opts = {}) {
  const { period = '1d', news: wantNews = true, timesfm: wantTimesfm = false } = opts;
  const [quote, fundamentals, history, news, timesfm] = await Promise.all([
    getQuote(ticker),
    getFundamentals(ticker),
    getHistoricalData(ticker, period),
    wantNews ? getYahooNews(ticker) : Promise.resolve([]),
    wantTimesfm ? getForecast(ticker).catch(() => null) : Promise.resolve(null),
  ]);

  const canon = quote.symbol || ticker.toUpperCase();
  const sources = {
    quote: quote.source || 'unknown',
    fundamentals: fundamentals.source || 'unknown',
    history: getLastSource(`hist:${canon}:${period}`),
    news: wantNews ? getLastSource(`news:${canon}`) : 'skipped',
    timesfm: timesfm ? 'timesfm' : 'none',
  };

  return {
    ticker: canon,
    asOf: new Date().toISOString(),
    quote,
    fundamentals,
    history,
    technicals: computeIndicators(history),
    news,
    timesfm,
    sources,
    synthetic: [sources.quote, sources.fundamentals, sources.history]
      .some(isSyntheticSource),
  };
}
