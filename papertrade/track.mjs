// Daily paper trader for the long-straddle screener.
//
// Runs on GitHub Actions after market close (and manually). Reuses the
// production screener (server/services/straddle.js) so paper results reflect
// the real screen. State lives in papertrade/paper-trades.json (committed).
//
// Rules (v1, deliberately simple and honest):
//   ENTRY : verdict EDGE, edge >= 1.3, expiry >= 5 days out,
//           no already-open position on the same underlying,
//           max 3 new entries per day (top edge first).
//   EXIT  : straddle value +50% (take profit) | -50% (stop) |
//           3 or fewer days to expiry (avoid expiry pinning) |
//           expiry passed -> settle at intrinsic value via Yahoo spot.
//   SCORE : per-share % P&L (no lot-size data needed):
//           (exitValue - entryCost) / entryCost * 100.
//
// Usage: node papertrade/track.mjs  (run from repo root; needs server deps)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { screenStraddles } from '../server/services/straddle.js';
import { getOptionChain } from '../server/services/optionChain.js';
import { getQuote } from '../server/services/yahooFinance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STATE_PATH = join(__dirname, 'paper-trades.json');

const MIN_EDGE = 1.3;
const MIN_DTE_ENTRY = 5;
const MAX_NEW_PER_DAY = 3;
const TP_MULT = 1.5;
const SL_MULT = 0.5;
const TIME_EXIT_DTE = 3;

function loadState() {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch (e) {
    console.warn('State unreadable, starting fresh:', e.message);
  }
  return { open: [], closed: [] };
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function yahooTicker(sym) {
  return sym === 'NIFTY' ? '^NSEI' : `${sym}.NS`;
}

async function straddleValue(sym, strike, expiry) {
  const chain = await getOptionChain(sym);
  if (!chain) return { value: null, spot: null, gone: true };
  if (chain.expiry !== expiry) return { value: null, spot: chain.spot, gone: true };
  const row = chain.strikes.find(s => s.strike === strike);
  if (!row || !row.ceLtp || !row.peLtp) return { value: null, spot: chain.spot, gone: true };
  return { value: row.ceLtp + row.peLtp, spot: chain.spot, gone: false, dte: chain.dteDays };
}

async function settleIntrinsic(pos) {
  // Expiry passed and chain gone: intrinsic = |spot - strike| at/after expiry.
  try {
    const q = await getQuote(yahooTicker(pos.underlying));
    const spot = q?.price;
    if (!spot) return null;
    return Math.abs(spot - pos.strike);
  } catch {
    return null;
  }
}

async function main() {
  const state = loadState();
  const today = new Date().toISOString().slice(0, 10);
  let entered = 0, exited = 0;

  // ---- 1. MTM + exits on open positions ----
  for (const pos of state.open) {
    if (pos.status !== 'open') continue;
    try {
      const { value, spot, gone, dte } = await straddleValue(pos.underlying, pos.strike, pos.expiry);
      pos.lastValue = value;
      pos.lastSpot = spot ?? pos.lastSpot;
      pos.lastChecked = today;

      let exitReason = null;
      let exitValue = value;
      if (value != null) {
        if (value >= pos.entryCost * TP_MULT) exitReason = 'take-profit +50%';
        else if (value <= pos.entryCost * SL_MULT) exitReason = 'stop-loss -50%';
        else if (dte != null && dte <= TIME_EXIT_DTE) exitReason = `time exit (${dte}d to expiry)`;
      } else if (gone) {
        const intrinsic = await settleIntrinsic(pos);
        if (intrinsic != null) {
          exitReason = 'expired — settled at intrinsic value';
          exitValue = intrinsic;
        }
      }

      if (exitReason) {
        const pnlPct = ((exitValue - pos.entryCost) / pos.entryCost) * 100;
        state.closed.push({
          ...pos, status: 'closed', exitDate: today,
          exitReason, exitValue: round2(exitValue), pnlPct: round2(pnlPct),
        });
        pos.status = 'closed-exited';
        exited++;
        console.log(`  EXIT ${pos.underlying} ${pos.strike}: ${exitReason} -> ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`);
      } else {
        const live = value != null ? ((value - pos.entryCost) / pos.entryCost) * 100 : null;
        console.log(`  HOLD ${pos.underlying} ${pos.strike}: ${live != null ? (live >= 0 ? '+' : '') + live.toFixed(1) + '%' : 'no quote'}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ ${pos.underlying}: ${e.message?.slice(0, 100)}`);
    }
  }
  state.open = state.open.filter(p => p.status === 'open');

  // ---- 2. Fresh screen -> entries ----
  try {
    const screen = await screenStraddles();
    const cands = (screen.rows || [])
      .filter(r => r.verdict === 'EDGE' && (r.edge ?? 0) >= MIN_EDGE && (r.dteDays ?? 0) >= MIN_DTE_ENTRY)
      .filter(r => !state.open.some(p => p.underlying === r.underlying))
      .filter(r => !state.closed.some(p => p.underlying === r.underlying && p.expiry === r.expiry && p.strike === r.atmStrike))
      .slice(0, MAX_NEW_PER_DAY);

    for (const r of cands) {
      state.open.push({
        status: 'open',
        underlying: r.underlying,
        strike: r.atmStrike,
        expiry: r.expiry,
        entryDate: today,
        entryCost: r.straddleCost,
        entrySpot: r.spot,
        entryEdge: r.edge,
        entryBreakevenPct: r.breakevenPct,
        lastValue: r.straddleCost,
        lastSpot: r.spot,
        lastChecked: today,
      });
      entered++;
      console.log(`  ENTER ${r.underlying} ${r.atmStrike} @ ₹${r.straddleCost} (edge ${r.edge})`);
    }
  } catch (e) {
    console.warn('Screen failed, skipping entries:', e.message?.slice(0, 120));
  }

  // ---- 3. Stats + save ----
  const closed = state.closed;
  const wins = closed.filter(p => p.pnlPct > 0);
  state.stats = {
    updated: today,
    openCount: state.open.length,
    closedCount: closed.length,
    winRate: closed.length ? round2((wins.length / closed.length) * 100) : null,
    avgPnlPct: closed.length ? round2(closed.reduce((a, p) => a + p.pnlPct, 0) / closed.length) : null,
    totalPnlPct: round2(closed.reduce((a, p) => a + p.pnlPct, 0)),
  };
  saveState(state);
  console.log(`✅ done: ${entered} entered, ${exited} exited, ${state.open.length} open. ` +
    (closed.length ? `Track: ${closed.length} closed, ${state.stats.winRate}% win, avg ${state.stats.avgPnlPct >= 0 ? '+' : ''}${state.stats.avgPnlPct}%` : 'No closed trades yet.'));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

main().catch(e => {
  console.error('Paper trader failed:', e);
  process.exit(1);
});
