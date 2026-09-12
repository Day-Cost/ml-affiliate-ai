const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'products', 'product-hunter.service.ts');
let text = fs.readFileSync(file, 'utf8');
const startMarker = '  private async resolveItemId(userId: string, itemId: string) {';
const endMarker = '\n  /**\n   * Converts a catalog PDP';
const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('PRODUCT_HUNTER_RESOLVE_ITEM_METHOD_NOT_FOUND');

const replacement = `  private async resolveItemId(userId: string, itemId: string) {
    const id = String(itemId || '').trim();
    if (!id) return null;
    try {
      const detail = await this.mercadoLivre.getItem(userId, id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(\`Authenticated item lookup failed for \${id}: \${error?.response?.status || error?.message || 'unknown'}\`);
    }
    try {
      const detail = await this.publicItem(id);
      if (detail?.id && detail?.permalink) return detail;
    } catch (error: any) {
      this.logger.debug(\`Public item lookup failed for \${id}: \${error?.response?.status || error?.message || 'unknown'}\`);
    }

    // Only construct a URL when the value is already a real MLB marketplace
    // item id. Catalog product ids are intentionally rejected.
    const match = id.match(/^(MLB)(\\d{9,})$/i);
    if (match) {
      const permalink = \`https://produto.mercadolivre.com.br/\${match[1].toUpperCase()}-\${match[2]}\`;
      this.logger.log(\`Resolved real item \${id} using deterministic Mercado Livre item URL fallback\`);
      return { id, permalink };
    }
    return null;
  }
`;

text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text);
console.log('Product Hunter repair applied');
