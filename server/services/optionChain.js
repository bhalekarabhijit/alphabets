// NSE option-chain access (official exchange feed via stock-nse-india).
// Cached 10 min — option prices move, but we screen, not market-make.
// Every function returns null on failure — never throws.

import { NseIndia } from 'stock-nse-india';
import { cached } from './cache.js';

const CHAIN_TTL_MS = 10 * 60 * 1000;

let nse = null;
function getNse() {
  if (!nse) nse = new NseIndia();
  return nse;
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

function parseNseDate(s) {
  // '08-Sep-2026' -> Date (local midnight approx is fine for DTE math)
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function isoLocal(d) {
  // IST-safe YYYY-MM-DD (toISOString would shift to the previous day).
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Normalized chain for the NEAREST expiry.
 * symbol: 'NIFTY' (index) or bare equity symbol like 'RELIANCE'.
 * Returns { underlying, name, spot, expiry, dteDays, atmStrike,
 *           strikes: [{ strike, ceLtp, ceIv, ceOi, peLtp, peIv, peOi }] }
 */
export async function getOptionChain(symbol) {
  return cached(`chain:${symbol}`, CHAIN_TTL_MS, () => fetchChain(symbol));
}

async function fetchChain(symbol) {
  try {
    const api = getNse();
    const raw = await withTimeout(
      symbol === 'NIFTY' ? api.getIndexOptionChain('NIFTY') : api.getEquityOptionChain(symbol),
      12000
    );
    if (!raw) return null;

    // Index chain: { records: { underlyingValue, expiryDates }, filtered: { data: [{strikePrice, CE, PE}] } }
    // Equity chain: { data: [flat OPTSTK/FUTSTK rows], timestamp }
    const rec = raw.records || null;
    if (rec) return parseIndexChain(symbol, raw, rec);
    if (Array.isArray(raw.data)) return parseEquityChain(symbol, raw.data);
    return null;
  } catch (e) {
    console.warn(`Option chain failed for ${symbol}: ${e.message?.slice(0, 120)}`);
    return null;
  }
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error('chain timeout')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function nearestExpiry(dates) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const valid = dates.map(parseNseDate).filter(Boolean);
  const expiry = valid.find(d => d >= now) || valid[0] || null;
  return { expiry, dteDays: expiry ? Math.max(0, Math.round((expiry - now) / 86400000)) : null };
}

function pickAtm(strikes, spot) {
  let atm = null;
  for (const s of strikes) {
    if (!s.ceLtp || !s.peLtp) continue;
    if (!atm || Math.abs(s.strike - spot) < Math.abs(atm.strike - spot)) atm = s;
  }
  return atm;
}

function parseIndexChain(symbol, raw, rec) {
  const rows = raw.filtered?.data || raw.data || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const spot = num(rec.underlyingValue, raw.underlyingValue);
  const { expiry, dteDays } = nearestExpiry(rec.expiryDates || []);
  if (dteDays === null) return null;

  const strikes = rows.map(r => {
    const strike = num(r.strikePrice);
    if (strike === null) return null;
    const ce = r.CE || {};
    const pe = r.PE || {};
    return {
      strike,
      ceLtp: num(ce.lastPrice),
      ceIv: num(ce.impliedVolatility),
      ceOi: num(ce.openInterest, ce.OI),
      peLtp: num(pe.lastPrice),
      peIv: num(pe.impliedVolatility),
      peOi: num(pe.openInterest, pe.OI),
    };
  }).filter(Boolean);

  return finishChain(symbol, spot, expiry, dteDays, strikes);
}

function parseEquityChain(symbol, rows) {
  // Group OPTSTK rows by expiry, take nearest; pair CE/PE per strike.
  const byExpiry = new Map();
  let spot = null;
  for (const r of rows) {
    if (r.instrumentType !== 'OPTSTK') continue;
    if (spot === null) spot = num(r.underlyingValue);
    const key = r.expiryDate;
    if (!byExpiry.has(key)) byExpiry.set(key, []);
    byExpiry.get(key).push(r);
  }
  if (!spot || byExpiry.size === 0) return null;

  const dated = [...byExpiry.keys()]
    .map(k => ({ key: k, date: parseNseDate(k) }))
    .filter(x => x.date)
    .sort((a, b) => a.date - b.date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const chosen = dated.find(x => x.date >= now) || dated[0];
  const dteDays = Math.max(0, Math.round((chosen.date - now) / 86400000));

  const legs = new Map(); // strike -> { ce, pe }
  for (const r of byExpiry.get(chosen.key)) {
    const strike = num(r.strikePrice);
    if (strike === null) continue;
    if (!legs.has(strike)) legs.set(strike, {});
    const side = r.optionType === 'CE' ? 'ce' : r.optionType === 'PE' ? 'pe' : null;
    if (!side) continue;
    legs.get(strike)[side] = {
      ltp: num(r.lastPrice),
      // Equity rows carry no IV — deliberately left null (shown as —).
      iv: null,
      oi: num(r.openInterest),
    };
  }

  const strikes = [...legs.entries()].map(([strike, l]) => ({
    strike,
    ceLtp: l.ce?.ltp ?? null,
    ceIv: null,
    ceOi: l.ce?.oi ?? null,
    peLtp: l.pe?.ltp ?? null,
    peIv: null,
    peOi: l.pe?.oi ?? null,
  }));

  return finishChain(symbol, spot, chosen.date, dteDays, strikes);
}

function finishChain(symbol, spot, expiry, dteDays, strikes) {
  if (!spot || strikes.length < 5) return null;
  const atm = pickAtm(strikes, spot);
  if (!atm) return null;
  return {
    underlying: symbol,
    spot,
    expiry: expiry ? isoLocal(expiry) : null,
    dteDays,
    atmStrike: atm.strike,
    strikes,
  };
}
