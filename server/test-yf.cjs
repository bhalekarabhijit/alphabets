const yahooFinance = require('yahoo-finance2').default;
console.log(typeof yahooFinance.quote);
yahooFinance.quote('AAPL').then(q => console.log('success')).catch(console.error);
