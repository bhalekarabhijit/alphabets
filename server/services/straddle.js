// Long-straddle screener: is the market underpricing the coming move?
//
// Core equation (standard vol-trading math):
//   breakeven%  = ATM straddle cost / spot            <- what the market prices in
//   impliedSigma = breakeven% / 0.8                   <- ATM straddle ~= 0.8 x 1-sigma move,
//                                                      so sigma ~= cost / 0.8
//   edge        = independent sigma estimate / impliedSigma
//   edge > ~1.15 -> movement looks cheap | < ~0.85 -> movement looks expensive
//
// Expected move comes from TWO independent estimators:
//   1. TimesFM p10–p90 band (80% interval ~= 2.56σ), scaled sqrt() to expiry.
//   2. ATR(14) daily range, scaled sqrt() to expiry.
// Neither knows direction — perfect for a direction-agnostic straddle screen.
// Educational screener, not advice. Long straddles win ~1/3 of the time.

import { getOptionChain } from './optionChain.js';
import { getHistoricalData } from './yahooFinance.js';
import { getForecast } from './timesfmForecast.js';
import { cached } from './cache.js';

const SCREEN_TTL_MS = 10 * 60 * 1000;

// NIFTY + liquid F&O names. Each chain fetch is tried best-effort;
// whatever succeeds (up to cap) makes the screen.
const CANDIDATES = [
  'NIFTY',
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN',
  'AXISBANK', 'KOTAKBANK', 'LT', 'TITAN', 'TATAMOTORS', 'SUNPHARMA',
  'BAJFINANCE', 'NTPC', 'ONGC', 'MARUTI',
];
const MAX_ROWS = 11; // NIFTY + up to 10 stocks

function yahooTicker(sym) {
  return sym === 'NIFTY' ? '^NSEI' : `${sym}.NS`;
}

export async function screenStraddles() {
  return cached('straddle-screen', SCREEN_TTL_MS, runScreen);
}

async function runScreen() {
  const rows = [];

  // Small batches to avoid hammering NSE.
  for (let i = 0; i < CANDIDATES.length && rows.length < MAX_ROWS; i += 3) {
    const batch = CANDIDATES.slice(i, i + 3);
    const results = await Promise.allSettled(batch.map(analyzeUnderlying));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && rows.length < MAX_ROWS) rows.push(r.value);
    }
  }

  // Best edge first; NO_DATA sinks to the bottom.
  rows.sort((a, b) => (b.edge ?? -1) - (a.edge ?? -1));

  return {
    generated_at: new Date().toISOString(),
    rows,
    method: 'ATM straddle cost vs TimesFM band + realized-vol expected move, sqrt-time-scaled to expiry',
  };
}

async function analyzeUnderlying(sym) {
  const chain = await getOptionChain(sym);
  if (!chain || chain.dteDays === null) return null;

  const atm = chain.strikes.find(s => s.strike === chain.atmStrike);
  if (!atm || !atm.ceLtp || !atm.peLtp) return null;

  const spot = chain.spot;
  const cost = atm.ceLtp + atm.peLtp;
  const breakevenPct = (cost / spot) * 100;
  const impliedSigma = breakevenPct / 0.8; // ATM straddle ~= 0.8 x 1-sigma move
  const iv = [atm.ceIv, atm.peIv].filter(v => v != null);
  const atmIv = iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : null;
  const dte = Math.max(chain.dteDays, 1);

  // Estimator 1: TimesFM band (20d horizon -> scale to expiry).
  let edgeTfm = null, tfmMove = null;
  try {
    const fc = await getForecast(yahooTicker(sym));
    if (fc && fc.p10?.length && fc.p90?.length && fc.last_close) {
      const band20 = ((fc.p90[fc.p90.length - 1] - fc.p10[fc.p10.length - 1]) / fc.last_close) * 100;
      const sigmaExp = (band20 / 2.56) * Math.sqrt(dte / 20);
      tfmMove = sigmaExp;
      if (impliedSigma > 0) edgeTfm = sigmaExp / impliedSigma;
    }
  } catch { /* no forecast -> ATR only */ }

  // Estimator 2: realized volatility — stdev of daily log returns,
  // scaled sqrt() to expiry. (ATR overstates close-to-close sigma because
  // it measures intraday high-low ranges, so we use returns directly.)
  let edgeRv = null, rvMove = null;
  try {
    const hist = await getHistoricalData(yahooTicker(sym), '1d');
    const closes = (hist || []).map(b => b.close).filter(Number.isFinite);
    if (closes.length > 22) {
      const rets = [];
      for (let i = Math.max(1, closes.length - 21); i < closes.length; i++) {
        rets.push(Math.log(closes[i] / closes[i - 1]));
      }
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
      const dailySigma = Math.sqrt(variance);
      if (dailySigma > 0) {
        rvMove = dailySigma * Math.sqrt(dte) * 100;
        if (impliedSigma > 0) edgeRv = rvMove / impliedSigma;
      }
    }
  } catch { /* history failed */ }

  const edges = [edgeTfm, edgeRv].filter(e => e != null && isFinite(e));
  if (!edges.length) return null;
  const edge = Math.max(...edges);

  const verdict = edge >= 1.15 ? 'EDGE' : edge >= 0.85 ? 'FAIR' : 'RICH';

  return {
    underlying: sym,
    spot: round2(spot),
    expiry: chain.expiry,
    dteDays: chain.dteDays,
    atmStrike: chain.atmStrike,
    callPrice: round2(atm.ceLtp),
    putPrice: round2(atm.peLtp),
    straddleCost: round2(cost),
    breakevenPct: round2(breakevenPct),
    atmIv: atmIv != null ? round2(atmIv) : null,
    tfmMovePct: tfmMove != null ? round2(tfmMove) : null,
    rvMovePct: rvMove != null ? round2(rvMove) : null,
    edgeTfm: edgeTfm != null ? round2(edgeTfm) : null,
    edgeRv: edgeRv != null ? round2(edgeRv) : null,
    edge: round2(edge),
    verdict,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
