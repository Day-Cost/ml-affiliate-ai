const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'repair-product-hunter.js');
let text = fs.readFileSync(file, 'utf8');

const oldUrl = "const productUrl = String(detail?.permalink || raw?.permalink || '').trim();";
const newUrl = "const upstreamUrl = String(detail?.permalink || raw?.permalink || '').trim();\\n      const productUrl = upstreamUrl.startsWith('https://') ? upstreamUrl : `https://produto.mercadolivre.com.br/\\${id.slice(0, 3)}-\\${id.slice(3)}`;";
if (!text.includes(oldUrl)) throw new Error('PRODUCT_HUNTER_TEMPLATE_URL_LINE_NOT_FOUND');
text = text.replace(oldUrl, newUrl);

const guard = /^\\s*if \(!\/\\^MLB.*return null;\\s*$/m;
if (!guard.test(text)) throw new Error('PRODUCT_HUNTER_TEMPLATE_GUARD_NOT_FOUND');
text = text.replace(guard, "      if (!/^MLB\\\\d{9,}$/i.test(id)) return null;");

fs.writeFileSync(file, text);
console.log('Product Hunter repair template patched');
