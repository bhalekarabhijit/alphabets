import * as yf from 'yahoo-finance2';
function findMethod(obj, name, path = 'root') {
  if (!obj || typeof obj !== 'object' && typeof obj !== 'function') return;
  if (obj[name]) console.log(`Found ${name} at ${path}`);
  Object.keys(obj).forEach(k => {
    if (k !== 'constructor' && k !== 'prototype') findMethod(obj[k], name, path + '.' + k);
  });
}
findMethod(yf, 'quote');
