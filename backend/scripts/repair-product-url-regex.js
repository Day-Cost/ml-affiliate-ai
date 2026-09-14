const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const oldUrlLine = "      const productUrl = String(detail.permalink || '').trim();";
const newUrlLines = "      const upstreamUrl = String(detail.permalink || '').trim();\n      const productUrl = upstreamUrl.startsWith('https://')\n        ? upstreamUrl\n        : `https://produto.mercadolivre.com.br/${id.slice(0, 3)}-${id.slice(3)}`;";
const oldGuard = "      if (!id || !productUrl || !productUrl.startsWith('https://')) return null;";
const newGuard = "      if (!/^MLB\\d{9,}$/.test(id)) return null;";

if (!text.includes(oldUrlLine) || !text.includes(oldGuard)) {
  throw new Error('PRODUCT_URL_VALIDATION_BLOCK_NOT_FOUND');
}
text = text.replace(oldUrlLine, newUrlLines).replace(oldGuard, newGuard);
fs.writeFileSync(file, text);
console.log('Product URL validation repaired for real Mercado Livre listings');
