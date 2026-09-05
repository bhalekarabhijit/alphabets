// Fallback data providers, used only when Yahoo Finance fails.
// Chain: Yahoo (primary) -> NSE direct / Downstox (fallback) -> synthetic.
// Every function returns null on failure — never throws.

import { NseIndia } from 'stock-nse-india';

let nse = null;
function getNse() {
  if (!nse) nse = new NseIndia();
  return nse;
}

async function withTimeout(promise, ms, label) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise;
  } catch (e) {
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function num(...candidates) {
  for (const c of candidates) {
    const n = Number(c);
    if (c !== null && c !== undefined && c !== '' && Number.isFinite(n)) return n;
  }
  return null;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function stripSuffix(ticker) {
  return ticker.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '').replace(/-EQ$/, '');
}

// ---------- NSE direct: quote ----------
export async function getNSEQuote(roughTicker) {
  try {
    const symbol = stripSuffix(roughTicker);
    const details = await withTimeout(getNse().getEquityDetails(symbol), 9000, 'nse-quote');
    if (!details) return null;

    // Shape varies by lib version; probe defensively.
    const info = details.info || {};
    const price = details.priceInfo || details.priceinfo || details.lastPrice || {};
    const meta = details.metadata || details.meta || {};

    const lastPrice = num(
      pick(price, ['lastPrice', 'lastTradedPrice', 'ltp', 'close']),
      pick(details, ['lastPrice', 'ltp'])
    );
    if (!lastPrice) return null;

    const prevClose = num(pick(price, ['previousClose', 'prevClose', 'basePrice']), lastPrice);
    const change = lastPrice - prevClose;

    // NSE nests ranges: intraDayHighLow {min,max}, weekHighLow {min,max}
    const dayHL = pick(price, ['intraDayHighLow']) || {};
    const wkHL = pick(price, ['weekHighLow']) || {};
    // When the market is closed NSE echoes 52w extremes in the intraday
    // fields — detect that and fall back to lastPrice instead.
    let dayHigh = num(pick(dayHL, ['max', 'high']), pick(price, ['dayHigh', 'high']));
    let dayLow = num(pick(dayHL, ['min', 'low']), pick(price, ['dayLow', 'low']));
    const wkHigh = num(pick(wkHL, ['max']), pick(price, ['high52', '52WeekHigh']));
    const wkLow = num(pick(wkHL, ['min']), pick(price, ['low52', '52WeekLow']));
    if (dayHigh === wkHigh && dayLow === wkLow) {
      dayHigh = null;
      dayLow = null;
    }
    const sector =
      pick(details.industryInfo || {}, ['sector', 'industry']) ||
      info.industry || null;

    return {
      symbol: roughTicker.toUpperCase(),
      name: info.companyName || info.symbol || symbol,
      price: lastPrice,
      change,
      changePercent: prevClose ? (change / prevClose) * 100 : 0,
      volume: num(pick(price, ['totalTradedVolume', 'volume', 'qty']), 0) || 0,
      avgVolume: num(pick(price, ['averageVolume', 'avgVolume']), 0) || 0,
      marketCap: null, // NSE quote endpoint doesn't reliably provide it
      high: dayHigh ?? lastPrice,
      low: dayLow ?? lastPrice,
      open: num(pick(price, ['open'])) ?? prevClose,
      prevClose,
      fiftyTwoWeekHigh: wkHigh ?? null,
      fiftyTwoWeekLow: wkLow ?? null,
      exchange: 'NSE',
      currency: 'INR',
      marketState: 'UNKNOWN',
      bid: null,
      ask: null,
      source: 'nse',
      sector,
    };
  } catch (e) {
    console.warn(`NSE quote fallback failed for ${roughTicker}: ${e.message}`);
    return null;
  }
}

// ---------- NSE direct: history (charting API) ----------
export async function getNSEHistory(roughTicker) {
  try {
    const symbol = stripSuffix(roughTicker);
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const rows = await withTimeout(
      getNse().getEquityHistoricalData(symbol, { start, end }),
      12000,
      'nse-history'
    );
    if (!rows) return null;

    // Shape: [{ data: [{ chOpeningPrice, chTradeHighPrice, ... }] }]
    const list = Array.isArray(rows)
      ? rows.flatMap((r) => (r && r.data ? r.data : [r]))
      : rows.data || rows.records || [];
    if (!list.length) return null;

    const mapped = list.map((r) => {
      const date = pick(r, ['date', 'mtimestamp', 'CH_TIMESTAMP', 'timestamp', 'mdate']);
      const open = num(pick(r, ['open', 'chOpeningPrice', 'CH_OPENING_PRICE', 'OPEN']));
      const close = num(pick(r, ['close', 'chClosingPrice', 'chLastTradedPrice', 'CH_CLOSING_PRICE', 'CLOSE', 'ltp']));
      if (open === null || close === null) return null;
      return {
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        open,
        high: num(pick(r, ['high', 'chTradeHighPrice', 'CH_TRADE_HIGH_PRICE', 'HIGH'])) ?? Math.max(open, close),
        low: num(pick(r, ['low', 'chTradeLowPrice', 'CH_TRADE_LOW_PRICE', 'LOW'])) ?? Math.min(open, close),
        close,
        volume: num(pick(r, ['volume', 'chTotTradedQty', 'CH_TOT_TRADED_QTY', 'TOT_TRADED_QTY', 'VOLUME'])) ?? 0,
      };
    }).filter(Boolean);

    if (mapped.length < 10) return null;
    mapped.sort((a, b) => new Date(a.date) - new Date(b.date));
    return mapped.map((m) => ({ ...m, source: undefined }));
  } catch (e) {
    console.warn(`NSE history fallback failed for ${roughTicker}: ${e.message}`);
    return null;
  }
}

// ---------- Downstox (free, no key): fundamentals + sector ----------
export async function getDownstoxFundamentals(roughTicker) {
  try {
    const symbol = stripSuffix(roughTicker);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    let res;
    try {
      res = await fetch(`https://downstox.com/api/stocks/${encodeURIComponent(symbol)}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Alphabets/1.0' },
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) return null;
    const json = await res.json();
    // Shape: { success, stock: {symbol,name,...}, sector, fundamentals: {...} }
    const stock = json?.stock;
    const f = json?.fundamentals;
    if (!stock || !f) return null;

    // mcap is in ₹ crore -> convert to ₹
    const mcapCr = num(f.mcap);
    return {
      trailingPE: num(f.pe),
      forwardPE: null,
      pegRatio: null,
      priceToBook: num(f.priceToBook),
      priceToSales: null,
      evToEbitda: null,
      evToRevenue: null,
      grossMargin: null,
      ebitdaMargin: null,
      operatingMargin: null,
      profitMargin: null,
      returnOnEquity: f.roe != null ? num(f.roe) / 100 : null,
      returnOnAssets: null,
      revenueGrowth: null,
      earningsGrowth: null,
      eps: null,
      forwardEps: null,
      debtToEquity: null,
      currentRatio: null,
      quickRatio: null,
      totalCash: null,
      totalDebt: null,
      bookValue: num(f.bookValue),
      dividendYield: f.divYield != null ? num(f.divYield) / 100 : null,
      payoutRatio: null,
      targetMeanPrice: null,
      targetHighPrice: null,
      targetLowPrice: null,
      recommendationKey: null,
      beta: null,
      shortRatio: null,
      sharesOutstanding: null,
      floatShares: null,
      heldPercentInsiders: null,
      heldPercentInstitutions: null,
      // Extras Downstox gives us that Yahoo doesn't reliably:
      sector: json?.sector || stock.sector || null,
      lastPrice: num(f.cmp),
      marketCap: mcapCr != null ? mcapCr * 1e7 : null,
      fScore: num(f.fScore),
      fundamentalsUpdatedAt: f.updatedAt || null,
      source: 'downstox',
    };
  } catch (e) {
    console.warn(`Downstox fallback failed for ${roughTicker}: ${e.message}`);
    return null;
  }
}
