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
import { loadRepoJson } from './repoJson.js';
import { buildQuantView } from './quantView.js';

export { getQuotesBatch };

export const SNAPSHOT_QUOTES_MAX_AGE_MS = 45 * 60 * 1000;  // 30-min cadence + slack
export const SNAPSHOT_TECH_MAX_AGE_MS = 26 * 60 * 60 * 1000; // daily after close

function isFresh(doc, maxAgeMs) {
  if (!doc || !doc.asOf) return false;
  return Date.now() - new Date(doc.asOf).getTime() < maxAgeMs;
}

/** Precomputed Nifty board (30-min cadence). Null when missing/stale. */
export async function getSnapshotQuotes() {
  const doc = await loadRepoJson('snapshot/quotes.json');
  return isFresh(doc, SNAPSHOT_QUOTES_MAX_AGE_MS) ? doc : null;
}

/** Precomputed daily technicals (after close). Null when missing/stale. */
export async function getSnapshotTechnicals() {
  const doc = await loadRepoJson('snapshot/technicals.json');
  return isFresh(doc, SNAPSHOT_TECH_MAX_AGE_MS) ? doc : null;
}

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
  const quantView = buildQuantView({ quote, history, timesfm, technicals });

  return {
    ticker: canon,
    asOf: new Date().toISOString(),
    quote,
    fundamentals,
    history,
    technicals,
    quantView,
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
  const { period = '1d', news: wantNews = true, timesfm: wantTimesfm = false, skipHistory = false } = opts;
  const [quote, fundamentals, history, news, timesfm] = await Promise.all([
    getQuote(ticker),
    getFundamentals(ticker),
    skipHistory ? Promise.resolve(null) : getHistoricalData(ticker, period),
    wantNews ? getYahooNews(ticker) : Promise.resolve([]),
    wantTimesfm ? getForecast(ticker).catch(() => null) : Promise.resolve(null),
  ]);

  const canon = quote.symbol || ticker.toUpperCase();
  const sources = {
    quote: quote.source || 'unknown',
    fundamentals: fundamentals.source || 'unknown',
    history: skipHistory ? 'skipped' : getLastSource(`hist:${canon}:${period}`),
    news: wantNews ? getLastSource(`news:${canon}`) : 'skipped',
    timesfm: timesfm ? 'timesfm' : 'none',
  };

  return {
    ticker: canon,
    asOf: new Date().toISOString(),
    quote,
    fundamentals,
    history,
    technicals: skipHistory ? null : computeIndicators(history),
    news,
    timesfm,
    sources,
    synthetic: [sources.quote, sources.fundamentals, sources.history]
      .some(isSyntheticSource),
  };
}
