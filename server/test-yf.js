import yahooFinance from 'yahoo-finance2';
console.log('Valid default export keys:', Object.keys(yahooFinance), typeof yahooFinance.quote);

import * as yf from 'yahoo-finance2';
console.log('yf keys:', Object.keys(yf));

import packageSpec from 'yahoo-finance2/package.json' with { type: 'json' };
console.log('Exports:', packageSpec.exports);
