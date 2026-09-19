// Portfolio brief: holdings in, morning brief out.
// One LLM call over compact precomputed bullets (no per-ticker analysis calls).

import { getScreeningBundle } from './marketData.js';
import { buildQuantView } from './quantView.js';
import { portfolioBrief } from './geminiAnalyzer.js';

const MAX_HOLDINGS = 12;

export async function buildBrief(rawTickers) {
  const tickers = [...new Set(rawTickers.map(t => String(t).toUpperCase().trim()))].slice(0, MAX_HOLDINGS);
  if (!tickers.length) throw new Error('Provide 1-12 tickers');

  const items = [];
  for (const t of tickers) {
    try {
      const b = await getScreeningBundle(t, { period: '1d', news: false, timesfm: true });
      const qv = buildQuantView({
        quote: b.quote, history: b.history, timesfm: b.timesfm, technicals: b.technicals,
      });
      const range = (b.quote.fiftyTwoWeekHigh || 0) - (b.quote.fiftyTwoWeekLow || 0);
      items.push({
        ticker: b.ticker,
        name: b.quote.name,
        price: b.quote.price,
        changePct: b.quote.changePercent,
        rsi: b.technicals?.current?.rsi ?? null,
        signal: b.technicals?.signals?.summary?.overall || 'UNKNOWN',
        quantDirection: qv.direction,
        quantMagnitude: qv.magnitudePct,
        pe: b.fundamentals?.trailingPE ?? null,
        offLowPct: range > 0 ? ((b.quote.price - b.quote.fiftyTwoWeekLow) / range) * 100 : null,
        source: b.quote.source || 'unknown',
      });
    } catch (e) {
      items.push({ ticker: t, error: e.message });
    }
  }

  const analyzable = items.filter(i => !i.error);
  if (!analyzable.length) throw new Error('No usable holdings data');
  const brief = await portfolioBrief(analyzable);

  return {
    asOf: new Date().toISOString(),
    items,
    brief,
  };
}
