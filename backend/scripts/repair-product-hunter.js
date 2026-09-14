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

    // Only real Mercado Livre marketplace publication IDs may reach /items/{id}.
    // Catalog/product IDs are rejected before any authenticated or public item call.
    if (!/^MLB\\d{9,}$/i.test(id)) {
      this.logger.debug(\`Skipping non-listing Mercado Livre ID \${id}\`);
      return null;
    }

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
    return null;
  }
`;
text = text.slice(0, start) + replacement + text.slice(end);

text = text.replace(
  'where: { id: `ml-${id}` },',
  "where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },"
);

const oldScore = `      await this.prisma.productScore.create({\n        data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content },\n      });`;
const newScore = `      const latestScore = await this.prisma.productScore.findFirst({\n        where: { productId: product.id },\n        orderBy: { calculatedAt: 'desc' },\n      });\n      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };\n      if (latestScore) {\n        await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });\n      } else {\n        await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });\n      }`;
if (!text.includes(oldScore)) throw new Error('PRODUCT_HUNTER_SCORE_BLOCK_NOT_FOUND');
text = text.replace(oldScore, newScore);

fs.writeFileSync(file, text);
console.log('Product Hunter repair applied');
