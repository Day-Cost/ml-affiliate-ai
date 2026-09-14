const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');
const before = '/^https:\\/\\/www\\.mercadolivre\\.com\\.br\\/.+/.test(productUrl)';
const after = '/^https:\\/\\/(?:www\\.|produto\\.)mercadolivre\\.com\\.br\\/.+/.test(productUrl)';
if (!text.includes(before)) throw new Error('PRODUCT_URL_VALIDATION_PATTERN_NOT_FOUND');
text = text.replace(before, after);
fs.writeFileSync(file, text);
console.log('Product URL validation repaired for real Mercado Livre listings');
