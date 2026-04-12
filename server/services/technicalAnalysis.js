import {
  SMA, EMA, RSI, MACD, BollingerBands,
  Stochastic, ATR, OBV, ADX, WilliamsR,
  CCI, VWAP
} from 'technicalindicators';

/**
 * Technical Analysis Engine
 * Computes all major technical indicators and generates trading signals
 */

export function computeIndicators(historicalData) {
  const closes = historicalData.map(d => d.close);
  const highs = historicalData.map(d => d.high);
  const lows = historicalData.map(d => d.low);
  const volumes = historicalData.map(d => d.volume);

  // === TREND INDICATORS ===
  const sma20 = SMA.calculate({ period: 20, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });
  const sma200 = SMA.calculate({ period: 200, values: closes });
  const ema12 = EMA.calculate({ period: 12, values: closes });
  const ema26 = EMA.calculate({ period: 26, values: closes });

  // === MOMENTUM INDICATORS ===
  const rsiValues = RSI.calculate({ period: 14, values: closes });
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const stochastic = Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3,
  });

  // === VOLATILITY INDICATORS ===
  const bollinger = BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  });
  const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

  // === VOLUME INDICATORS ===
  const obv = OBV.calculate({ close: closes, volume: volumes });

  // === ADDITIONAL ===
  let adxValues = [];
  try {
    adxValues = ADX.calculate({ period: 14, high: highs, low: lows, close: closes });
  } catch (e) { /* insufficient data */ }

  let williamsR = [];
  try {
    williamsR = WilliamsR.calculate({ period: 14, high: highs, low: lows, close: closes });
  } catch (e) { /* insufficient data */ }

  let cci = [];
  try {
    cci = CCI.calculate({ period: 20, high: highs, low: lows, close: closes });
  } catch (e) { /* insufficient data */ }

  // Get latest values
  const currentPrice = closes[closes.length - 1];
  const latestRSI = rsiValues[rsiValues.length - 1];
  const latestMACD = macdValues[macdValues.length - 1];
  const prevMACD = macdValues[macdValues.length - 2];
  const latestBollinger = bollinger[bollinger.length - 1];
  const latestStoch = stochastic[stochastic.length - 1];
  const latestATR = atr[atr.length - 1];
  const latestADX = adxValues[adxValues.length - 1];
  const latestWilliamsR = williamsR[williamsR.length - 1];
  const latestCCI = cci[cci.length - 1];

  const latestSMA20 = sma20[sma20.length - 1];
  const latestSMA50 = sma50[sma50.length - 1];
  const latestSMA200 = sma200.length > 0 ? sma200[sma200.length - 1] : null;
  const latestEMA12 = ema12[ema12.length - 1];
  const latestEMA26 = ema26[ema26.length - 1];

  // === GENERATE SIGNALS ===
  const signals = generateSignals({
    currentPrice,
    latestRSI,
    latestMACD,
    prevMACD,
    latestBollinger,
    latestStoch,
    latestSMA20,
    latestSMA50,
    latestSMA200,
    latestEMA12,
    latestEMA26,
    latestATR,
    latestADX,
    latestWilliamsR,
    latestCCI,
  });

  return {
    current: {
      price: currentPrice,
      sma20: latestSMA20,
      sma50: latestSMA50,
      sma200: latestSMA200,
      ema12: latestEMA12,
      ema26: latestEMA26,
      rsi: latestRSI,
      macd: latestMACD,
      bollinger: latestBollinger,
      stochastic: latestStoch,
      atr: latestATR,
      adx: latestADX,
      williamsR: latestWilliamsR,
      cci: latestCCI,
    },
    series: {
      sma20: padArray(sma20, closes.length),
      sma50: padArray(sma50, closes.length),
      sma200: padArray(sma200, closes.length),
      ema12: padArray(ema12, closes.length),
      ema26: padArray(ema26, closes.length),
      rsi: padArray(rsiValues, closes.length),
      macd: padMACDArray(macdValues, closes.length),
      bollinger: padBollingerArray(bollinger, closes.length),
      obv: padArray(obv, closes.length),
    },
    signals,
  };
}

function generateSignals(data) {
  const signals = [];

  // RSI Signal
  if (data.latestRSI !== undefined) {
    if (data.latestRSI < 30) {
      signals.push({ indicator: 'RSI', signal: 'BUY', value: data.latestRSI.toFixed(1), reason: 'Oversold territory (< 30)' });
    } else if (data.latestRSI > 70) {
      signals.push({ indicator: 'RSI', signal: 'SELL', value: data.latestRSI.toFixed(1), reason: 'Overbought territory (> 70)' });
    } else {
      signals.push({ indicator: 'RSI', signal: 'NEUTRAL', value: data.latestRSI.toFixed(1), reason: 'Normal range (30-70)' });
    }
  }

  // MACD Signal
  if (data.latestMACD && data.prevMACD) {
    const currHistogram = data.latestMACD.histogram;
    const prevHistogram = data.prevMACD.histogram;
    if (prevHistogram < 0 && currHistogram >= 0) {
      signals.push({ indicator: 'MACD', signal: 'BUY', value: currHistogram?.toFixed(2), reason: 'Bullish crossover (histogram crossed above zero)' });
    } else if (prevHistogram > 0 && currHistogram <= 0) {
      signals.push({ indicator: 'MACD', signal: 'SELL', value: currHistogram?.toFixed(2), reason: 'Bearish crossover (histogram crossed below zero)' });
    } else if (currHistogram > 0) {
      signals.push({ indicator: 'MACD', signal: 'BUY', value: currHistogram?.toFixed(2), reason: 'Bullish momentum (histogram positive)' });
    } else {
      signals.push({ indicator: 'MACD', signal: 'SELL', value: currHistogram?.toFixed(2), reason: 'Bearish momentum (histogram negative)' });
    }
  }

  // Bollinger Band Signal
  if (data.latestBollinger) {
    const { upper, lower, middle } = data.latestBollinger;
    if (data.currentPrice <= lower) {
      signals.push({ indicator: 'Bollinger Bands', signal: 'BUY', value: `${lower.toFixed(2)}`, reason: 'Price at lower band (potential bounce)' });
    } else if (data.currentPrice >= upper) {
      signals.push({ indicator: 'Bollinger Bands', signal: 'SELL', value: `${upper.toFixed(2)}`, reason: 'Price at upper band (potential reversal)' });
    } else {
      signals.push({ indicator: 'Bollinger Bands', signal: 'NEUTRAL', value: `${middle.toFixed(2)}`, reason: 'Price within bands' });
    }
  }

  // SMA Trend Signal
  if (data.latestSMA50 && data.latestSMA200) {
    if (data.latestSMA50 > data.latestSMA200 && data.currentPrice > data.latestSMA50) {
      signals.push({ indicator: 'Moving Averages', signal: 'BUY', value: `SMA50>${data.latestSMA50.toFixed(0)}`, reason: 'Golden cross pattern (SMA50 > SMA200, price above both)' });
    } else if (data.latestSMA50 < data.latestSMA200 && data.currentPrice < data.latestSMA50) {
      signals.push({ indicator: 'Moving Averages', signal: 'SELL', value: `SMA50<${data.latestSMA50.toFixed(0)}`, reason: 'Death cross pattern (SMA50 < SMA200, price below both)' });
    } else {
      signals.push({ indicator: 'Moving Averages', signal: 'NEUTRAL', value: `SMA50=${data.latestSMA50.toFixed(0)}`, reason: 'Mixed signals between moving averages' });
    }
  }

  // Stochastic Signal
  if (data.latestStoch) {
    const k = data.latestStoch.k;
    const d = data.latestStoch.d;
    if (k < 20 && d < 20) {
      signals.push({ indicator: 'Stochastic', signal: 'BUY', value: `K:${k?.toFixed(1)}`, reason: 'Oversold (K & D below 20)' });
    } else if (k > 80 && d > 80) {
      signals.push({ indicator: 'Stochastic', signal: 'SELL', value: `K:${k?.toFixed(1)}`, reason: 'Overbought (K & D above 80)' });
    } else {
      signals.push({ indicator: 'Stochastic', signal: 'NEUTRAL', value: `K:${k?.toFixed(1)}`, reason: 'Normal range' });
    }
  }

  // ADX Trend Strength
  if (data.latestADX) {
    const adxVal = data.latestADX.adx;
    if (adxVal > 25) {
      signals.push({ indicator: 'ADX', signal: 'NEUTRAL', value: adxVal?.toFixed(1), reason: `Strong trend detected (ADX=${adxVal?.toFixed(1)})` });
    } else {
      signals.push({ indicator: 'ADX', signal: 'NEUTRAL', value: adxVal?.toFixed(1), reason: 'Weak/no trend (ADX < 25)' });
    }
  }

  // Williams %R
  if (data.latestWilliamsR !== undefined) {
    if (data.latestWilliamsR < -80) {
      signals.push({ indicator: 'Williams %R', signal: 'BUY', value: data.latestWilliamsR?.toFixed(1), reason: 'Oversold (< -80)' });
    } else if (data.latestWilliamsR > -20) {
      signals.push({ indicator: 'Williams %R', signal: 'SELL', value: data.latestWilliamsR?.toFixed(1), reason: 'Overbought (> -20)' });
    } else {
      signals.push({ indicator: 'Williams %R', signal: 'NEUTRAL', value: data.latestWilliamsR?.toFixed(1), reason: 'Normal range' });
    }
  }

  // Overall signal summary
  const buyCount = signals.filter(s => s.signal === 'BUY').length;
  const sellCount = signals.filter(s => s.signal === 'SELL').length;
  const neutralCount = signals.filter(s => s.signal === 'NEUTRAL').length;

  let overallSignal = 'NEUTRAL';
  if (buyCount > sellCount && buyCount > neutralCount) overallSignal = 'BUY';
  else if (sellCount > buyCount && sellCount > neutralCount) overallSignal = 'SELL';

  return {
    individual: signals,
    summary: {
      overall: overallSignal,
      buy: buyCount,
      sell: sellCount,
      neutral: neutralCount,
      total: signals.length,
    },
  };
}

function padArray(arr, targetLength) {
  const padding = new Array(targetLength - arr.length).fill(null);
  return [...padding, ...arr];
}

function padMACDArray(arr, targetLength) {
  const padding = new Array(targetLength - arr.length).fill({ MACD: null, signal: null, histogram: null });
  return [...padding, ...arr];
}

function padBollingerArray(arr, targetLength) {
  const padding = new Array(targetLength - arr.length).fill({ upper: null, middle: null, lower: null, pb: null });
  return [...padding, ...arr];
}
