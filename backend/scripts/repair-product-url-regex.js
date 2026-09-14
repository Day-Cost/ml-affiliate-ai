const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');

const oldBlock = `      const id = String(detail.id || '');
      const productUrl = String(detail.permalink || '').trim();
      if (!id || !productUrl || !productUrl.startsWith('https://')) return null;`;
const newBlock = `      const id = String(detail.id || '').trim().toUpperCase();
      if (!/^MLB\\d{9,}$/.test(id)) return null;
      const upstreamUrl = String(detail.permalink || '').trim();
      const productUrl = upstreamUrl.startsWith('https://')
        ? upstreamUrl
        : \`https://produto.mercadolivre.com.br/\${id.slice(0, 3)}-\${id.slice(3)}\`;`;

if (!text.includes(oldBlock)) throw new Error('PRODUCT_URL_VALIDATION_BLOCK_NOT_FOUND');
text = text.replace(oldBlock, newBlock);
fs.writeFileSync(file, text);
console.log('Product URL validation repaired for real Mercado Livre listings');
