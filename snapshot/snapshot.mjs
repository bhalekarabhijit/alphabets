// Scheduled snapshot materializer (GitHub Actions, free).
//   node snapshot/snapshot.mjs --job=quotes      # Nifty 50 + NIFTY spot (1 batched Yahoo call)
//   node snapshot/snapshot.mjs --job=technicals  # daily bars -> precomputed indicators
// Writes snapshot/*.json (committed). The API serves these first and only
// goes live on miss/staleness — so reads are instant and Yahoo sees ~95%
// less traffic. Run from repo root; needs server/node_modules.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getQuotesBatch, getHistoricalData } from '../server/services/yahooFinance.js';
import { computeIndicators } from '../server/services/technicalAnalysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT = __dirname;

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

function save(name, payload) {
  writeFileSync(join(OUT, name), JSON.stringify(payload));
  console.log(`wrote snapshot/${name}`);
}

async function jobQuotes() {
  // One batched Yahoo request for the whole board.
  const quotes = await getQuotesBatch([...NIFTY_50, '^NSEI']);
  const map = {};
  for (const q of quotes) {
    if (!q || !q.price) continue;
    map[q.symbol] = {
      name: q.name,
      price: q.price, change: q.change, changePercent: q.changePercent,
      volume: q.volume, avgVolume: q.avgVolume, marketCap: q.marketCap,
      open: q.open, high: q.high, low: q.low, prevClose: q.prevClose,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh, fiftyTwoWeekLow: q.fiftyTwoWeekLow,
      source: q.source || 'yahoo',
    };
  }
  save('quotes.json', { asOf: new Date().toISOString(), quotes: map });
  console.log(`snapshotted ${Object.keys(map).length} quotes`);
}

async function jobTechnicals() {
  // One daily-history fetch per ticker -> compact current+signals.
  // (Full chart series stay live-fetched for display; this is the signal layer.)
  // Batched: 50 sequential chart calls are too slow from throttled IPs.
  const out = {};
  let ok = 0;
  for (let i = 0; i < NIFTY_50.length; i += 5) {
    const batch = NIFTY_50.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(async (t) => {
      const hist = await getHistoricalData(t, '1d');
      if (!hist || hist.length < 30) throw new Error('too little history');
      return [t, computeIndicators(hist)];
    }));
    for (const r of results) {
      if (r.status !== 'fulfilled') {
        console.warn(`  skip: ${r.reason?.message?.slice(0, 80)}`);
        continue;
      }
      const [t, ind] = r.value;
      out[t] = { current: ind.current, signals: ind.signals };
      ok++;
    }
    // Checkpoint each batch so slow runs still bank partial progress.
    save('technicals.json', { asOf: new Date().toISOString(), technicals: out });
  }
  console.log(`snapshotted technicals for ${ok} tickers`);
  if (ok < 25) throw new Error('Too few technicals snapshotted');
}

const job = (process.argv.find(a => a.startsWith('--job=')) || '').split('=')[1];
if (job === 'quotes') await jobQuotes();
else if (job === 'technicals') await jobTechnicals();
else {
  console.error('Usage: node snapshot/snapshot.mjs --job=quotes|technicals');
  process.exit(1);
}
