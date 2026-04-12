import yahooFinance from 'yahoo-finance2';
yahooFinance.chart('AAPL', { period1: '2023-01-01', period2: '2023-01-05' }).then(c => console.log('success')).catch(console.error);
