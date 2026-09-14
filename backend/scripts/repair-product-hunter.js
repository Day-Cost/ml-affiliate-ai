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
    return null;
  }
`;
text = text.slice(0, start) + replacement + text.slice(end);

text = text.replace(
  'where: { id: `ml-${id}` },',
  "where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },"
);

const oldScore = `      await this.prisma.productScore.create({\n        data: { productId: product.id, score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content },\n      });`;
const newScore = `      const latestScore = await this.prisma.productScore.findFirst({ where: { productId: product.id }, orderBy: { calculatedAt: 'desc' } });\n      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };\n      if (latestScore) await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });\n      else await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });`;
if (text.includes(oldScore)) text = text.replace(oldScore, newScore);

const searchStartMarker = '  async search(query: string, userId?: string) {';
const searchEndMarker = '\n  async searchForConnectedUser(query: string) {';
const searchStart = text.indexOf(searchStartMarker);
const searchEnd = text.indexOf(searchEndMarker, searchStart);
if (searchStart < 0 || searchEnd < 0) throw new Error('PRODUCT_HUNTER_SEARCH_METHOD_NOT_FOUND');

const searchReplacement = `  async search(query: string, userId?: string) {
    if (!query.trim()) return { query, total: 0, items: [] };
    if (!userId) throw new UnauthorizedException('MERCADO_LIVRE_USER_REQUIRED');

    let data: any;
    try {
      // MercadoLivreService performs the OAuth-authenticated listing search first.
      // This is the authoritative source for real marketplace publications.
      data = await this.mercadoLivre.searchCatalog(userId, query);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 || error?.message === 'MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED') {
        throw new UnauthorizedException('MERCADO_LIVRE_TOKEN_INVALID_RECONNECT_REQUIRED');
      }
      throw new UnauthorizedException(error?.message || \`MERCADO_LIVRE_SEARCH_FAILED_\${status || 'NETWORK'}\`);
    }

    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const items = (await Promise.all(rawResults.map(async (raw: any) => {
      const detail: any = raw?.item || raw;
      const id = String(detail?.id || raw?.id || '').trim();
      const productUrl = String(detail?.permalink || raw?.permalink || '').trim();
      if (!/^MLB\\d{9,}$/i.test(id) || !/^https:\\/\\/www\\.mercadolivre\\.com\\.br\\/.+/.test(productUrl)) return null;

      const price = Number(detail?.price ?? raw?.price ?? 0);
      const originalPrice = detail?.original_price != null ? Number(detail.original_price) : null;
      const discount = originalPrice && price > 0 ? Math.max(0, ((originalPrice - price) / originalPrice) * 100) : 0;
      const rating = detail?.reviews?.rating_average != null ? Number(detail.reviews.rating_average) : null;
      const reviewsCount = Number(detail?.reviews?.total || 0);
      const soldQuantityRaw = detail?.sold_quantity ?? raw?.sold_quantity ?? null;
      const soldQuantity = soldQuantityRaw == null ? null : Number(soldQuantityRaw);
      const demand = soldQuantity == null ? 35 : Math.min(100, soldQuantity > 0 ? 35 + Math.log10(soldQuantity + 1) * 20 : 25);
      const quality = rating == null ? 50 : Math.min(100, rating * 20);
      const pictureCount = Array.isArray(detail?.pictures) ? detail.pictures.length : 0;
      const content = Math.min(100, 55 + pictureCount * 5);
      const score = this.scoring.calculate({ demand, conversion: 50, commission: 50, discount: Math.min(100, discount), quality, competition: 50, trend: 50, content });
      const categoryId = detail?.category_id || raw?.category_id || null;
      const categoryName = detail?.domain_name || detail?.domain_id || null;
      const imageUrl = detail?.thumbnail?.secure_url || detail?.thumbnail || raw?.thumbnail || detail?.pictures?.[0]?.url || null;

      const product = await this.prisma.product.upsert({
        where: { marketplace_externalProductId: { marketplace: 'MERCADOLIVRE', externalProductId: id } },
        create: {
          id: \`ml-\${id}\`, marketplace: 'MERCADOLIVRE', externalProductId: id,
          title: String(detail?.title || raw?.title || ''), categoryId, categoryName, price, originalPrice,
          discountPercent: discount, currency: detail?.currency_id || raw?.currency_id || 'BRL', rating,
          reviewsCount, soldQuantity, sellerId: detail?.seller?.id ? BigInt(detail.seller.id) : (raw?.seller_id ? BigInt(raw.seller_id) : null),
          sellerName: detail?.seller?.nickname || null, imageUrl, productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
        update: {
          title: String(detail?.title || raw?.title || ''), categoryId, categoryName, price, originalPrice,
          discountPercent: discount, currency: detail?.currency_id || raw?.currency_id || 'BRL', rating,
          reviewsCount, soldQuantity, sellerId: detail?.seller?.id ? BigInt(detail.seller.id) : (raw?.seller_id ? BigInt(raw.seller_id) : null),
          sellerName: detail?.seller?.nickname || null, imageUrl, productUrl,
          availability: detail?.available_quantity != null ? String(detail.available_quantity) : null,
        },
      });

      const latestScore = await this.prisma.productScore.findFirst({ where: { productId: product.id }, orderBy: { calculatedAt: 'desc' } });
      const scoreData = { score, demand, conversion: 50, commission: 50, discount, quality, competition: 50, trend: 50, content };
      if (latestScore) await this.prisma.productScore.update({ where: { id: latestScore.id }, data: scoreData });
      else await this.prisma.productScore.create({ data: { productId: product.id, ...scoreData } });

      return {
        id, dbId: product.id, title: detail?.title || raw?.title, price, originalPrice,
        discountPercent: Number(discount.toFixed(2)), rating, reviewsCount, soldQuantity,
        thumbnail: imageUrl, permalink: productUrl, affiliateUrl: product.affiliateUrl, score,
        affiliateStatus: product.affiliateUrl ? 'ACTIVE' : 'PENDING',
        dataQuality: { demand: soldQuantity != null ? 'REAL' : 'LIMITED', conversion: 'NOT_AVAILABLE', commission: product.affiliateUrl ? 'LINK_READY' : 'LINK_REQUIRED', trend: 'NOT_AVAILABLE', competition: 'ESTIMATE' },
      };
    }))).filter(Boolean);

    this.logger.log(\`Product Hunter search query="\${query}" source=oauth-real-listings results=\${rawResults.length} realListings=\${items.length}\`);
    return { query, total: items.length, items };
  }
`;
text = text.slice(0, searchStart) + searchReplacement + text.slice(searchEnd);

fs.writeFileSync(file, text);
console.log('Product Hunter repair applied');
