// QuantView: one structured quantitative verdict per ticker, built from
// model output + market history. Pure function — no fetching, so it's free
// to call anywhere a snapshot bundle exists.
//
// Fields:
//   direction: UP | DOWN | FLAT (sign of TimesFM p50 drift, else 20d momentum)
//   magnitudePct, bandWidthPct (p90-p10), rvDailyPct (20d realized vol)
//   agreesWithMomentum: does the model agree with recent price momentum?
//   confidence: 0-100 TRANSPARENT heuristic (documented below, not magic)
//   drivers: human-readable evidence lines for prompts and UI

export function buildQuantView({ quote, history, timesfm, technicals } = {}) {
  const closes = (history || []).map(b => b.close).filter(Number.isFinite);
  const lastClose = quote?.price || closes[closes.length - 1] || null;

  // Realized daily vol from last 20 log returns.
  let rvDailyPct = null;
  let momentum20 = null;
  if (closes.length > 22) {
    const rets = [];
    for (let i = closes.length - 21; i < closes.length; i++) {
      rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    rvDailyPct = Math.sqrt(variance) * 100;
    momentum20 = ((closes[closes.length - 1] / closes[closes.length - 21]) - 1) * 100;
  }

  const rsi = technicals?.current?.rsi ?? null;

  let direction = 'FLAT';
  let magnitudePct = 0;
  let bandWidthPct = null;
  if (timesfm && timesfm.expected_return_pct !== undefined) {
    magnitudePct = timesfm.expected_return_pct;
    const up = (timesfm.upside_pct ?? 0);
    const down = (timesfm.downside_pct ?? 0);
    bandWidthPct = up - down;
    direction = magnitudePct > 1 ? 'UP' : magnitudePct < -1 ? 'DOWN' : 'FLAT';
  } else if (momentum20 !== null) {
    direction = momentum20 > 2 ? 'UP' : momentum20 < -2 ? 'DOWN' : 'FLAT';
    magnitudePct = momentum20;
  }

  const agreesWithMomentum = (timesfm && momentum20 !== null)
    ? Math.sign(magnitudePct) === Math.sign(momentum20) && magnitudePct !== 0
    : null;

  // Confidence heuristic (transparent by design):
  // 50 base; narrow band +15 / wide band -20; agrees with momentum +10,
  // disagrees -10; |drift| > 2% +10 (conviction) else -5; clamp 5-95.
  // Without a model forecast the ceiling is 40 (history-only).
  let confidence = 50;
  if (!timesfm) {
    confidence = 30;
  } else {
    if (bandWidthPct !== null) {
      if (bandWidthPct < 12) confidence += 15;
      else if (bandWidthPct > 25) confidence -= 20;
    }
    if (agreesWithMomentum === true) confidence += 10;
    else if (agreesWithMomentum === false) confidence -= 10;
    confidence += Math.abs(magnitudePct) > 2 ? 10 : -5;
  }
  confidence = Math.max(5, Math.min(95, Math.round(confidence)));

  const drivers = [];
  if (timesfm) {
    drivers.push(`TimesFM 20d drift ${magnitudePct >= 0 ? '+' : ''}${magnitudePct.toFixed(1)}% (band ${bandWidthPct?.toFixed(1)}% wide)`);
  } else {
    drivers.push('No model forecast — history-only view');
  }
  if (rvDailyPct !== null) drivers.push(`20d realized vol ${rvDailyPct.toFixed(2)}%/day`);
  if (momentum20 !== null) {
    drivers.push(`20d momentum ${momentum20 >= 0 ? '+' : ''}${momentum20.toFixed(1)}%${agreesWithMomentum === true ? ' (agrees with model)' : agreesWithMomentum === false ? ' (FIGHTS the model)' : ''}`);
  }
  if (rsi !== null) drivers.push(`RSI ${rsi.toFixed(0)}${rsi > 70 ? ' (overbought)' : rsi < 30 ? ' (oversold)' : ''}`);

  return {
    direction, magnitudePct: round2(magnitudePct),
    bandWidthPct: bandWidthPct != null ? round2(bandWidthPct) : null,
    rvDailyPct: rvDailyPct != null ? round2(rvDailyPct) : null,
    rsi: rsi != null ? round2(rsi) : null,
    agreesWithMomentum, confidence, drivers,
    hasModel: !!timesfm,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
