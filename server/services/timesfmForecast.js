// Serves TimesFM batch forecasts generated nightly by GitHub Actions
// (see /forecast/README.md). Zero runtime cost: the Node server only
// reads a JSON file. Gracefully returns null when forecasts don't exist.

import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORECASTS_PATH = join(__dirname, '../../forecast/forecasts.json');
const PICKS_PATH = join(__dirname, '../../forecast/picks.json');

let forecastsCache = null;
let forecastsMtime = 0;
let picksCache = null;
let picksMtime = 0;

function loadJson(path, getMtime, setCache) {
  try {
    const mtime = statSync(path).mtimeMs;
    if (getMtime() === mtime && getMtime() !== 0) return true; // fresh
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    setCache(raw, mtime);
    return true;
  } catch {
    return false;
  }
}

function ensureForecasts() {
  const ok = loadJson(
    FORECASTS_PATH,
    () => forecastsMtime,
    (raw, mtime) => {
      forecastsCache = raw;
      forecastsMtime = mtime;
      const n = raw && raw.forecasts ? Object.keys(raw.forecasts).length : 0;
      console.log(`📈 Loaded TimesFM forecasts for ${n} tickers (as of ${raw?.generated_at || 'unknown'})`);
    }
  );
  return ok ? forecastsCache : null;
}

function ensurePicks() {
  const ok = loadJson(
    PICKS_PATH,
    () => picksMtime,
    (raw, mtime) => {
      picksCache = raw;
      picksMtime = mtime;
    }
  );
  return ok ? picksCache : null;
}

function normalizeTicker(t) {
  return t.toUpperCase().trim().replace(/\.NS$/, '').replace(/\.BO$/, '');
}

export function getForecast(roughTicker) {
  const data = ensureForecasts();
  if (!data || !data.forecasts) return null;
  const key = normalizeTicker(roughTicker);
  // forecasts.json is keyed by bare symbol (RELIANCE) for readability.
  const fc = data.forecasts[key]
    || data.forecasts[`${key}.NS`]
    || data.forecasts[`${key}.BO`];
  if (!fc) return null;
  return { ...fc, generated_at: data.generated_at, model: data.model || 'timesfm' };
}

export function getTimesfmPicks() {
  return ensurePicks();
}
