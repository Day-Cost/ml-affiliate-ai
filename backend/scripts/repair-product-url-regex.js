const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const oldUrlLine = "      const productUrl = String(detail?.permalink || raw?.permalink || '').trim();";
const newUrlLines = "      const upstreamUrl = String(detail?.permalink || raw?.permalink || '').trim();\n      const productUrl = upstreamUrl.startsWith('https://')\n        ? upstreamUrl\n        : `https://produto.mercadolivre.com.br/${id.slice(0, 3)}-${id.slice(3)}`;";
if (!text.includes(oldUrlLine)) throw new Error('PRODUCT_URL_LINE_NOT_FOUND');
text = text.replace(oldUrlLine, newUrlLines);

const guardPattern = /^      if \(!\^MLB.*return null;$/m;
if (!guardPattern.test(text)) throw new Error('PRODUCT_URL_GUARD_NOT_FOUND');
text = text.replace(guardPattern, "      if (!/^MLB\\d{9,}$/.test(id)) return null;");

fs.writeFileSync(file, text);
console.log('Product URL validation repaired for real Mercado Livre listings');
