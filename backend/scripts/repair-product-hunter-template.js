const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'repair-product-hunter.js');
let text = fs.readFileSync(file, 'utf8');

const oldUrl = "const productUrl = String(detail?.permalink || raw?.permalink || '').trim();";
const newUrl = "const upstreamUrl = String(detail?.permalink || raw?.permalink || '').trim();\n      const productUrl = upstreamUrl.startsWith('https://') ? upstreamUrl : `https://produto.mercadolivre.com.br/${id.slice(0, 3)}-${id.slice(3)}`;";
if (!text.includes(oldUrl)) throw new Error('PRODUCT_HUNTER_TEMPLATE_URL_LINE_NOT_FOUND');
text = text.replace(oldUrl, newUrl);

const blockedUrlCondition = new RegExp("\\s*\\|\\| !/\\^https:[^\\n]+?\\.test\\(productUrl\\)");
text = text.replace(blockedUrlCondition, '');

fs.writeFileSync(file, text);
console.log('Product Hunter repair template patched');
